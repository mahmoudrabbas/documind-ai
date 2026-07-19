"""
Tesseract OCR microservice exposing a REST endpoint for document OCR.

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
from typing import List

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
import pytesseract

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ocr")

app = FastAPI(title="OCR Service", version="1.0.0")

LANG_MAP = {
    "ar": "ara",
    "en": "eng",
    "ar+en": "ara+eng",
}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr(
    files: List[UploadFile] = File(...),
    languages: List[str] = Form(default=["ara"]),
):
    request_id = str(uuid.uuid4())[:12]
    start = time.time()
    results = []

    for idx, file in enumerate(files):
        lang_code = languages[idx] if idx < len(languages) else languages[0]
        tess_lang = LANG_MAP.get(lang_code, "ara")
        page_start = time.time()

        try:
            image_bytes = await file.read()
            image = Image.open(io.BytesIO(image_bytes))

            data = pytesseract.image_to_data(image, lang=tess_lang, output_type=pytesseract.Output.DICT)

            all_text_parts = []
            all_words = []
            confidences = []

            n_boxes = len(data["text"])
            for i in range(n_boxes):
                text = data["text"][i].strip()
                conf = int(data["conf"][i])
                if not text or conf < 0:
                    continue

                all_text_parts.append(text)
                confidences.append(conf)

                x = data["left"][i]
                y = data["top"][i]
                w = data["width"][i]
                h = data["height"][i]

                all_words.append({
                    "text": text,
                    "confidence": round(conf / 100, 4),
                    "boundingBox": {
                        "x": round(float(x), 2),
                        "y": round(float(y), 2),
                        "width": round(float(w), 2),
                        "height": round(float(h), 2),
                    },
                })

            full_text = " ".join(all_text_parts)
            avg_confidence = round(sum(confidences) / len(confidences) / 100, 4) if confidences else 0
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
                f"[{request_id}] Page {idx + 1}: {len(all_text_parts)} words, "
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
