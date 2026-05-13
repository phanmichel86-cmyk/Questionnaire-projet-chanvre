"""Identification de cartes via API distantes.

- Pokémon : api.pokemontcg.io (gratuit, clé optionnelle pour des quotas plus élevés).
- One Piece : à brancher plus tard (apitcg.com / limitless). Stub pour l'instant.
"""
from __future__ import annotations

import httpx

from .config import settings
from .schemas import CardMatch

POKEMON_API = "https://api.pokemontcg.io/v2/cards"


async def search_pokemon_by_name(name: str, limit: int = 5) -> list[CardMatch]:
    if not name:
        return []
    headers = {}
    if settings.pokemon_tcg_api_key:
        headers["X-Api-Key"] = settings.pokemon_tcg_api_key

    params = {"q": f'name:"{name}"', "pageSize": limit}
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(POKEMON_API, params=params, headers=headers)
        r.raise_for_status()
        data = r.json().get("data", [])

    out: list[CardMatch] = []
    for c in data:
        out.append(
            CardMatch(
                id=c.get("id", ""),
                name=c.get("name", ""),
                set_name=(c.get("set") or {}).get("name"),
                set_id=(c.get("set") or {}).get("id"),
                number=c.get("number"),
                rarity=c.get("rarity"),
                image_url=(c.get("images") or {}).get("small"),
                score=0.5,  # placeholder ; remplacé par matching visuel plus tard
            )
        )
    return out


async def search_one_piece_by_name(name: str, limit: int = 5) -> list[CardMatch]:
    # TODO: brancher une source pour One Piece (apitcg.com, limitless, ou catalogue local).
    return []
