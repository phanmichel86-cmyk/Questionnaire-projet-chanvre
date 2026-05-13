"""Tests basiques pour la détection de carte.

Génère une fausse carte (rectangle blanc à ratio Pokémon) sur fond sombre,
puis vérifie que le pipeline la détecte et la redresse.
"""
import cv2
import numpy as np

from app.card_detection import CARD_ASPECT, TARGET_HEIGHT, TARGET_WIDTH, detect_and_warp


def _synthetic_card(canvas: tuple[int, int] = (1200, 1600)) -> np.ndarray:
    h, w = canvas
    img = np.full((h, w, 3), 30, dtype=np.uint8)  # fond sombre

    card_w = 500
    card_h = int(card_w / CARD_ASPECT)
    x = (w - card_w) // 2
    y = (h - card_h) // 2
    cv2.rectangle(img, (x, y), (x + card_w, y + card_h), (240, 240, 240), thickness=-1)
    cv2.putText(img, "TEST", (x + 80, y + card_h // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 3, (10, 10, 10), 6)
    return img


def test_detect_and_warp_finds_card() -> None:
    img = _synthetic_card()
    warped, info = detect_and_warp(img)

    assert info["detected"] is True
    assert warped is not None
    assert warped.shape[0] == TARGET_HEIGHT
    assert warped.shape[1] == TARGET_WIDTH
    assert abs(info["aspect_ratio"] - CARD_ASPECT) < 0.02


def test_detect_returns_none_on_blank() -> None:
    blank = np.full((800, 600, 3), 128, dtype=np.uint8)
    warped, info = detect_and_warp(blank)
    assert warped is None
    assert info["detected"] is False
