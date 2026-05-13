from __future__ import annotations

import io

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from .card_detection import CARD_ASPECT, detect_and_warp
from .config import settings
from .identification import search_one_piece_by_name, search_pokemon_by_name
from .schemas import DetectionInfo, ScanResponse

app = FastAPI(title="TCG Pre-Grading API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_GAMES = {"pokemon", "onepiece"}
MIN_SHARPNESS = 80.0  # variance Laplacien en-dessous = flou
ASPECT_TOLERANCE = 0.08


def _read_image(upload_bytes: bytes) -> np.ndarray:
    try:
        pil = Image.open(io.BytesIO(upload_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Image illisible : {exc}") from exc
    arr = np.array(pil)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/scan", response_model=ScanResponse)
async def scan(
    image: UploadFile = File(...),
    game: str = Form("pokemon"),
    name_hint: str | None = Form(None),
) -> ScanResponse:
    game = game.lower()
    if game not in SUPPORTED_GAMES:
        raise HTTPException(status_code=400, detail=f"Jeu non supporté : {game}")

    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Fichier vide.")

    img = _read_image(raw)
    warped, info = detect_and_warp(img)

    warnings: list[str] = []
    if not info["detected"]:
        warnings.append("Carte non détectée : recadre, ajoute du contraste avec le fond.")
    else:
        if abs(info["aspect_ratio"] - CARD_ASPECT) > ASPECT_TOLERANCE:
            warnings.append("Ratio inhabituel pour une carte standard.")
        if info["sharpness"] < MIN_SHARPNESS:
            warnings.append("Image floue : reprends une photo plus nette.")

    candidates = []
    if name_hint:
        if game == "pokemon":
            candidates = await search_pokemon_by_name(name_hint)
        else:
            candidates = await search_one_piece_by_name(name_hint)

    return ScanResponse(
        game=game,
        detection=DetectionInfo(**info),
        candidates=candidates,
        warnings=warnings,
    )
