from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "DEVOPS_REPORT.md"
OUTPUT = ROOT / "DEVOPS_REPORT.pdf"


def build_styles():
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=14,
            alignment=TA_LEFT,
        ),
        "h2": ParagraphStyle(
            "Heading2Custom",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=colors.HexColor("#111827"),
            spaceBefore=12,
            spaceAfter=8,
        ),
        "h3": ParagraphStyle(
            "Heading3Custom",
            parent=styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#1f2937"),
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "BodyCustom",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#111827"),
            spaceAfter=6,
        ),
        "bullet": ParagraphStyle(
            "BulletCustom",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            leftIndent=14,
            firstLineIndent=-8,
            bulletIndent=4,
            textColor=colors.HexColor("#111827"),
            spaceAfter=4,
        ),
        "code": ParagraphStyle(
            "CodeCustom",
            parent=styles["BodyText"],
            fontName="Courier",
            fontSize=8.5,
            leading=11,
            backColor=colors.HexColor("#f3f4f6"),
            borderPadding=6,
            leftIndent=8,
            rightIndent=8,
            spaceAfter=8,
        ),
    }


def escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def flush_paragraph(buffer, story, styles):
    if not buffer:
        return
    text = " ".join(line.strip() for line in buffer).strip()
    if text:
        story.append(Paragraph(escape(text), styles["body"]))
    buffer.clear()


def flush_code(buffer, story, styles):
    if not buffer:
        return
    code = "<br/>".join(escape(line.rstrip()) for line in buffer)
    story.append(Paragraph(code, styles["code"]))
    story.append(Spacer(1, 0.12 * cm))
    buffer.clear()


def parse_markdown(md_text: str):
    styles = build_styles()
    story = []
    paragraph_buffer = []
    code_buffer = []
    in_code = False

    for raw_line in md_text.splitlines():
        line = raw_line.rstrip("\n")
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_paragraph(paragraph_buffer, story, styles)
            if in_code:
                flush_code(code_buffer, story, styles)
                in_code = False
            else:
                in_code = True
            continue

        if in_code:
            code_buffer.append(line)
            continue

        if stripped == "":
            flush_paragraph(paragraph_buffer, story, styles)
            continue

        if stripped.startswith("# "):
            flush_paragraph(paragraph_buffer, story, styles)
            story.append(Paragraph(escape(stripped[2:].strip()), styles["title"]))
            continue

        if stripped.startswith("## "):
            flush_paragraph(paragraph_buffer, story, styles)
            story.append(Paragraph(escape(stripped[3:].strip()), styles["h2"]))
            continue

        if stripped.startswith("### "):
            flush_paragraph(paragraph_buffer, story, styles)
            story.append(Paragraph(escape(stripped[4:].strip()), styles["h3"]))
            continue

        if stripped.startswith("- "):
            flush_paragraph(paragraph_buffer, story, styles)
            story.append(Paragraph(escape(stripped[2:].strip()), styles["bullet"], bulletText="•"))
            continue

        if stripped[:2].isdigit() and stripped[1:3] == ". ":
            flush_paragraph(paragraph_buffer, story, styles)
            story.append(Paragraph(escape(stripped[3:].strip()), styles["bullet"], bulletText=stripped[:1] + "."))
            continue

        paragraph_buffer.append(stripped)

    flush_paragraph(paragraph_buffer, story, styles)
    flush_code(code_buffer, story, styles)
    return story


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing report source: {SOURCE}")

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title="Your-Docs DevOps Report",
        author="OpenAI Codex",
    )

    story = parse_markdown(SOURCE.read_text(encoding="utf-8"))
    doc.build(story)
    print(f"Created {OUTPUT}")


if __name__ == "__main__":
    main()
