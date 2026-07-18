"""
PaddleOCR microservice exposing a REST endpoint for document OCR.

POST /ocr
  - files: image files (multipart)
  - languages: language codes (form field, repeated)

Returns JSON with per-page text, confidence, words, and bounding boxes.
"""

import io
import os
import time
import uuid
import logging
from typing import List, Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR
from PIL import Image
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("paddle-ocr")

app = FastAPI(title="PaddleOCR Service", version="1.0.0")

LANG_MAP = {
    "ar": "ar",
    "en": "en",
    "ar+en": "ar",
}

_ocr_instances: dict = {}


def get_ocr(lang: str) -> PaddleOCR:
    if lang not in _ocr_instances:
        _ocr_instances[lang] = PaddleOCR(
            use_angle_cls=True,
            lang=lang,
            show_log=False,
            use_gpu=False,
        )
    return _ocr_instances[lang]


@app.get("/health")
async def health():
    return {"status": "ok", "providers": list(_ocr_instances.keys())}


@app.post("/ocr")
async def ocr(
    files: List[UploadFile] = File(...),
    languages: List[str] = Form(default=["ar"]),
):
    request_id = str(uuid.uuid4())[:12]
    start = time.time()
    results = []

    for idx, file in enumerate(files):
        lang = languages[idx] if idx < len(languages) else languages[0]
        lang = LANG_MAP.get(lang, "ar")
        page_start = time.time()

        try:
            image_bytes = await file.read()
            image = Image.open(io.BytesIO(image_bytes))
            image_array = np.array(image)

            ocr = get_ocr(lang)
            ocr_result = ocr.ocr(image_array, cls=True)

            all_text_parts = []
            all_words = []
            confidences = []

            if ocr_result and ocr_result[0]:
                for line in ocr_result[0]:
                    box, (text, confidence) = line
                    all_text_parts.append(text)
                    confidences.append(confidence)

                    x_coords = [p[0] for p in box]
                    y_coords = [p[1] for p in box]
                    x_min, x_max = min(x_coords), max(x_coords)
                    y_min, y_max = min(y_coords), max(y_coords)

                    all_words.append({
                        "text": text,
                        "confidence": round(confidence, 4),
                        "boundingBox": {
                            "x": round(x_min, 2),
                            "y": round(y_min, 2),
                            "width": round(x_max - x_min, 2),
                            "height": round(y_max - y_min, 2),
                        },
                    })

            full_text = " ".join(all_text_parts)
            avg_confidence = round(sum(confidences) / len(confidences), 4) if confidences else 0
            duration_ms = round((time.time() - page_start) * 1000)

            warnings = []
            if avg_confidence < 0.5:
                warnings.append(f"Low average confidence: {round(avg_confidence * 100)}%")

            results.append({
                "pageNumber": idx + 1,
                "text": full_text,
                "confidence": avg_confidence,
                "words": all_words,
                "warnings": warnings,
            })

            logger.info(
                f"[{request_id}] Page {idx + 1}: {len(all_text_parts)} lines, "
                f"confidence={avg_confidence:.2%}, duration={duration_ms}ms"
            )

        except Exception as e:
            logger.error(f"[{request_id}] Page {idx + 1} failed: {e}")
            results.append({
                "pageNumber": idx + 1,
                "text": "",
                "confidence": 0,
                "words": [],
                "warnings": [f"OCR failed: {str(e)}"],
            })

    total_duration = round((time.time() - start) * 1000)
    logger.info(f"[{request_id}] Batch complete: {len(results)} pages, {total_duration}ms total")

    return JSONResponse({
        "requestId": request_id,
        "pages": results,
    })


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8501"))
    uvicorn.run(app, host="0.0.0.0", port=port)
