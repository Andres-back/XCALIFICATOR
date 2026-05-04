from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build

from app.core.config import get_settings


settings = get_settings()

SCOPES = [
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive",
]

EMU = "EMU"
EMU_PER_PIXEL = 9525


def _load_service_account_info(raw_value: str) -> dict[str, Any]:
    value = (raw_value or "").strip()
    if not value:
        raise ValueError("GOOGLE_SERVICE_ACCOUNT_JSON no esta configurado")

    if value.startswith("{"):
        return json.loads(value)

    if not os.path.exists(value):
        raise ValueError("GOOGLE_SERVICE_ACCOUNT_JSON no es JSON valido ni ruta existente")

    with open(value, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _make_credentials():
    info = _load_service_account_info(settings.GOOGLE_SERVICE_ACCOUNT_JSON)
    return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)


def _to_emu(px: int) -> int:
    return int(px * EMU_PER_PIXEL)


def _build_slide_requests(slides: list[dict[str, Any]]) -> list[dict[str, Any]]:
    requests: list[dict[str, Any]] = []

    for idx, slide in enumerate(slides, start=1):
        slide_id = f"s{idx}"
        title_id = f"s{idx}_title"
        body_id = f"s{idx}_body"
        image_id = f"s{idx}_img"

        title = str(slide.get("title") or f"Diapositiva {idx}").strip()
        body = str(slide.get("body") or "").strip()
        bullets = slide.get("bullets") if isinstance(slide.get("bullets"), list) else []
        image_url = str(slide.get("image_url") or "").strip()

        if bullets:
            bullet_lines = [f"- {str(item).strip()}" for item in bullets if str(item).strip()]
            if bullet_lines:
                body = (body + "\n\n" if body else "") + "\n".join(bullet_lines)

        requests.append(
            {
                "createSlide": {
                    "objectId": slide_id,
                    "slideLayoutReference": {"predefinedLayout": "BLANK"},
                    "insertionIndex": idx - 1,
                }
            }
        )

        requests.append(
            {
                "createShape": {
                    "objectId": title_id,
                    "shapeType": "TEXT_BOX",
                    "elementProperties": {
                        "pageObjectId": slide_id,
                        "size": {
                            "height": {"magnitude": _to_emu(70), "unit": EMU},
                            "width": {"magnitude": _to_emu(1180), "unit": EMU},
                        },
                        "transform": {
                            "scaleX": 1,
                            "scaleY": 1,
                            "translateX": _to_emu(50),
                            "translateY": _to_emu(30),
                            "unit": EMU,
                        },
                    },
                }
            }
        )

        requests.append(
            {
                "insertText": {
                    "objectId": title_id,
                    "insertionIndex": 0,
                    "text": title,
                }
            }
        )

        requests.append(
            {
                "createShape": {
                    "objectId": body_id,
                    "shapeType": "TEXT_BOX",
                    "elementProperties": {
                        "pageObjectId": slide_id,
                        "size": {
                            "height": {"magnitude": _to_emu(520), "unit": EMU},
                            "width": {"magnitude": _to_emu(760), "unit": EMU},
                        },
                        "transform": {
                            "scaleX": 1,
                            "scaleY": 1,
                            "translateX": _to_emu(50),
                            "translateY": _to_emu(120),
                            "unit": EMU,
                        },
                    },
                }
            }
        )

        if body:
            requests.append(
                {
                    "insertText": {
                        "objectId": body_id,
                        "insertionIndex": 0,
                        "text": body,
                    }
                }
            )

        if image_url:
            requests.append(
                {
                    "createImage": {
                        "objectId": image_id,
                        "url": image_url,
                        "elementProperties": {
                            "pageObjectId": slide_id,
                            "size": {
                                "height": {"magnitude": _to_emu(460), "unit": EMU},
                                "width": {"magnitude": _to_emu(450), "unit": EMU},
                            },
                            "transform": {
                                "scaleX": 1,
                                "scaleY": 1,
                                "translateX": _to_emu(840),
                                "translateY": _to_emu(130),
                                "unit": EMU,
                            },
                        },
                    }
                }
            )

    return requests


def _export_google_slides_sync(
    *,
    title: str,
    slides: list[dict[str, Any]],
    share_to_anyone: bool,
    parent_folder_id: str,
) -> dict[str, Any]:
    if not slides:
        raise ValueError("No hay diapositivas para exportar a Google Slides")

    creds = _make_credentials()
    slides_service = build("slides", "v1", credentials=creds, cache_discovery=False)
    drive_service = build("drive", "v3", credentials=creds, cache_discovery=False)

    created = slides_service.presentations().create(body={"title": title}).execute()
    presentation_id = str(created.get("presentationId") or "").strip()
    if not presentation_id:
        raise ValueError("No se pudo crear la presentacion en Google Slides")

    default_slide_id = ""
    existing_slides = created.get("slides") if isinstance(created.get("slides"), list) else []
    if existing_slides:
        default_slide_id = str((existing_slides[0] or {}).get("objectId") or "").strip()

    requests: list[dict[str, Any]] = []
    if default_slide_id:
        requests.append({"deleteObject": {"objectId": default_slide_id}})

    requests.extend(_build_slide_requests(slides))

    slides_service.presentations().batchUpdate(
        presentationId=presentation_id,
        body={"requests": requests},
    ).execute()

    folder_id = str(parent_folder_id or "").strip()
    if folder_id:
        drive_service.files().update(
            fileId=presentation_id,
            addParents=folder_id,
            fields="id, parents",
        ).execute()

    if share_to_anyone:
        try:
            drive_service.permissions().create(
                fileId=presentation_id,
                body={"type": "anyone", "role": "reader"},
            ).execute()
        except Exception:
            # Permission failures should not break a successful export.
            pass

    return {
        "presentation_id": presentation_id,
        "url": f"https://docs.google.com/presentation/d/{presentation_id}/edit",
        "embed_url": f"https://docs.google.com/presentation/d/{presentation_id}/embed?start=false&loop=false&delayms=3000",
    }


class GoogleSlidesService:
    async def export_presentation(
        self,
        *,
        title: str,
        slides: list[dict[str, Any]],
        share_to_anyone: bool | None = None,
        parent_folder_id: str | None = None,
    ) -> dict[str, Any]:
        if not settings.GOOGLE_SLIDES_EXPORT_ENABLED:
            raise ValueError("GOOGLE_SLIDES_EXPORT_ENABLED esta desactivado")

        share = settings.GOOGLE_SLIDES_SHARE_TO_ANYONE if share_to_anyone is None else bool(share_to_anyone)
        folder_id = parent_folder_id if parent_folder_id is not None else settings.GOOGLE_SLIDES_PARENT_FOLDER_ID

        return await asyncio.to_thread(
            _export_google_slides_sync,
            title=title,
            slides=slides,
            share_to_anyone=share,
            parent_folder_id=folder_id or "",
        )
