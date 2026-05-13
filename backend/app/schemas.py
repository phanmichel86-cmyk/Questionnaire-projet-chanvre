from pydantic import BaseModel, Field


class CardMatch(BaseModel):
    id: str
    name: str
    set_name: str | None = None
    set_id: str | None = None
    number: str | None = None
    rarity: str | None = None
    image_url: str | None = None
    score: float = Field(ge=0.0, le=1.0)


class DetectionInfo(BaseModel):
    detected: bool
    width: int
    height: int
    aspect_ratio: float
    sharpness: float


class ScanResponse(BaseModel):
    game: str
    detection: DetectionInfo
    candidates: list[CardMatch] = []
    warnings: list[str] = []
