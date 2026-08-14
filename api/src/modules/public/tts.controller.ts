import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import {
  DEFAULT_VOICE,
  isVoiceAllowed,
  sanitizeText,
  synthesizeText,
} from "./tts.service.js";

/**
 * GET /public/tts?text=...&voice=...
 *
 * Synthesizes the given text with a curated neural voice and returns MP3
 * audio. `voice` is optional and must be on the allowlist; the default voice
 * is used when omitted.
 */
export async function ttsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const rawText = typeof req.query.text === "string" ? req.query.text : "";
    const sanitized = sanitizeText(rawText);
    if (!sanitized) {
      throw new AppError(400, "VALIDATION_ERROR", "text is required");
    }

    const voice =
      typeof req.query.voice === "string" ? req.query.voice : DEFAULT_VOICE;
    if (!isVoiceAllowed(voice)) {
      throw new AppError(400, "VALIDATION_ERROR", "voice is not allowed");
    }

    let audio: Buffer;
    try {
      audio = await synthesizeText(sanitized, voice);
    } catch (error) {
      throw new AppError(
        502,
        "TTS_UPSTREAM_ERROR",
        "Speech synthesis is temporarily unavailable",
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(audio.length));
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).end(audio);
  } catch (error) {
    next(error);
  }
}