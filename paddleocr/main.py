import io
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from PIL import Image
from paddleocr import PaddleOCR

app = FastAPI(title="Xalificator OCR Service", version="1.0.0")

# Initialize PaddleOCR with Spanish + English
ocr = PaddleOCR(
    use_angle_cls=True,
    lang="es",
    use_gpu=False,
    show_log=False,
)


@app.post("/ocr")
async def extract_text(file: UploadFile = File(...)):
    """Extract text from uploaded image using PaddleOCR."""
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        img_array = np.array(image)

        result = ocr.ocr(img_array, cls=True)

        if not result or not result[0]:
            return {"text": "", "details": []}

        # Extract text lines ordered by position (top to bottom)
        lines = []
        details = []
        for line in result[0]:
            box = line[0]
            text = line[1][0]
            confidence = line[1][1]
            y_pos = min(p[1] for p in box)

            lines.append({"text": text, "confidence": confidence, "y": y_pos})
            details.append({
                "text": text,
                "confidence": round(confidence, 4),
                "box": box,
            })

        # Sort by vertical position
        lines.sort(key=lambda l: l["y"])
        full_text = "\n".join(l["text"] for l in lines)

        return {"text": full_text, "details": details}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error OCR: {str(e)}")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "PaddleOCR"}
