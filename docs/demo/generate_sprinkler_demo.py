"""One-off: render an annotated demo of the sprinkler-map view over hole 5."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public" / "holes" / "hole-5-landscape.png"
OUT = ROOT / "docs" / "demo" / "sprinkler-map-demo.png"

# Sample sprinklers: (x_pct, y_pct, satellite, station, area)
# Coords are eyeballed against the hole-5 landscape image (tee right, green left).
PINS = [
    # Tee complex (right side)
    (0.92, 0.55, 3, 1, "tee"),
    (0.90, 0.62, 3, 1, "tee"),   # second head on same station
    (0.88, 0.48, 3, 2, "tee"),
    # Fairway (middle, paired stations every ~50 yds)
    (0.78, 0.55, 3, 5, "fairway"),
    (0.72, 0.48, 3, 5, "fairway"),
    (0.65, 0.60, 3, 6, "fairway"),
    (0.58, 0.50, 3, 7, "fairway"),
    (0.50, 0.58, 3, 7, "fairway"),
    (0.42, 0.52, 3, 8, "fairway"),
    (0.35, 0.60, 3, 9, "fairway"),
    (0.28, 0.50, 3, 9, "fairway"),
    (0.22, 0.55, 3, 10, "fairway"),
    # Green ring (left side) - satellite 4 takes over here
    (0.16, 0.40, 4, 12, "green"),  # back
    (0.12, 0.50, 4, 13, "green"),  # back-left
    (0.10, 0.60, 4, 14, "green"),  # left
    (0.13, 0.70, 4, 15, "green"),  # front-left
    (0.18, 0.75, 4, 16, "green"),  # front
    (0.23, 0.70, 4, 17, "green"),  # front-right
    (0.25, 0.60, 4, 18, "green"),  # right
    (0.22, 0.45, 4, 19, "green"),  # back-right
]

COLORS = {
    "green":   (34, 197, 94),    # emerald
    "tee":     (132, 204, 22),   # lime
    "fairway": (59, 130, 246),   # blue
}

def render():
    img = Image.open(SRC).convert("RGBA")
    w, h = img.size

    # Slightly darken so colored pins pop
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 40))
    img = Image.alpha_composite(img, overlay)

    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("arial.ttf", 11)
        font_sm = ImageFont.truetype("arial.ttf", 9)
    except OSError:
        font = ImageFont.load_default()
        font_sm = font

    pin_r = 9
    for x_pct, y_pct, sat, sta, area in PINS:
        cx, cy = int(x_pct * w), int(y_pct * h)
        color = COLORS[area]
        # White halo
        draw.ellipse(
            (cx - pin_r - 2, cy - pin_r - 2, cx + pin_r + 2, cy + pin_r + 2),
            fill=(255, 255, 255, 230),
        )
        # Colored pin
        draw.ellipse(
            (cx - pin_r, cy - pin_r, cx + pin_r, cy + pin_r),
            fill=color + (255,),
        )
        # Station number inside
        text = str(sta)
        tb = draw.textbbox((0, 0), text, font=font_sm)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        draw.text(
            (cx - tw / 2, cy - th / 2 - 1),
            text,
            fill=(255, 255, 255),
            font=font_sm,
        )

    # Legend bottom-left
    lx, ly = 8, h - 78
    draw.rounded_rectangle((lx, ly, lx + 180, ly + 70), radius=6, fill=(0, 0, 0, 170))
    draw.text((lx + 8, ly + 4), "Legend", fill=(255, 255, 255), font=font)
    for i, (label, color) in enumerate(
        [("Green head", "green"), ("Tee head", "tee"), ("Fairway head", "fairway")]
    ):
        yy = ly + 22 + i * 15
        draw.ellipse((lx + 10, yy, lx + 22, yy + 12), fill=COLORS[color] + (255,))
        draw.text((lx + 30, yy - 1), label, fill=(255, 255, 255), font=font_sm)

    # Header strip top
    draw.rounded_rectangle((0, 0, w, 28), radius=0, fill=(15, 23, 42, 220))
    draw.text((10, 6), "Hole 5  -  Sprinkler Map  (demo)", fill=(255, 255, 255), font=font)
    draw.text(
        (w - 200, 6),
        "Sat 3: tee + fairway | Sat 4: green",
        fill=(200, 220, 255),
        font=font_sm,
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(OUT, "PNG")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    render()
