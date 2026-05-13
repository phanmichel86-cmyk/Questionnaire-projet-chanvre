"""Détection de carte TCG dans une image + redressement perspective.

Les cartes Pokémon et One Piece partagent les mêmes dimensions physiques
(63 x 88 mm), donc un ratio cible de 63/88 ≈ 0.7159.
"""
from __future__ import annotations

import cv2
import numpy as np

CARD_ASPECT = 63.0 / 88.0  # largeur / hauteur
TARGET_WIDTH = 750
TARGET_HEIGHT = int(round(TARGET_WIDTH / CARD_ASPECT))  # ~1047 px


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Réordonne 4 points en [top-left, top-right, bottom-right, bottom-left]."""
    pts = pts.reshape(4, 2).astype("float32")
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).ravel()
    return np.array(
        [
            pts[np.argmin(s)],      # top-left
            pts[np.argmin(diff)],   # top-right
            pts[np.argmax(s)],      # bottom-right
            pts[np.argmax(diff)],   # bottom-left
        ],
        dtype="float32",
    )


def _find_card_contour(image_bgr: np.ndarray) -> np.ndarray | None:
    """Cherche le plus grand quadrilatère plausible dans l'image."""
    h, w = image_bgr.shape[:2]
    img_area = float(h * w)

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    edges = cv2.Canny(gray, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]
    for c in contours:
        area = cv2.contourArea(c)
        if area < 0.05 * img_area:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            return approx
    return None


def _warp_to_card(image_bgr: np.ndarray, quad: np.ndarray) -> np.ndarray:
    src = _order_corners(quad)
    dst = np.array(
        [[0, 0], [TARGET_WIDTH - 1, 0], [TARGET_WIDTH - 1, TARGET_HEIGHT - 1], [0, TARGET_HEIGHT - 1]],
        dtype="float32",
    )
    m = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(image_bgr, m, (TARGET_WIDTH, TARGET_HEIGHT))

    # Si la carte est en paysage (ratio inversé), on tourne.
    if warped.shape[1] > warped.shape[0]:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)
    return warped


def sharpness(image_bgr: np.ndarray) -> float:
    """Variance du Laplacien : plus c'est haut, plus c'est net."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def detect_and_warp(image_bgr: np.ndarray) -> tuple[np.ndarray | None, dict]:
    """Retourne (carte_redressée_ou_None, info)."""
    quad = _find_card_contour(image_bgr)
    if quad is None:
        h, w = image_bgr.shape[:2]
        return None, {
            "detected": False,
            "width": w,
            "height": h,
            "aspect_ratio": round(w / h, 4) if h else 0.0,
            "sharpness": sharpness(image_bgr),
        }

    warped = _warp_to_card(image_bgr, quad)
    h, w = warped.shape[:2]
    return warped, {
        "detected": True,
        "width": w,
        "height": h,
        "aspect_ratio": round(w / h, 4),
        "sharpness": sharpness(warped),
    }
