from __future__ import annotations

import sys
from pathlib import Path
from typing import List

try:
    from pypdf import PdfReader
except Exception as e:  # pragma: no cover
    print("Missing dependency pypdf. Install with: python -m pip install pypdf", file=sys.stderr)
    raise


def extract_pdf_to_text(in_path: Path, out_path: Path) -> None:
    reader = PdfReader(str(in_path))
    parts: List[str] = []
    for i, page in enumerate(reader.pages):
        try:
            parts.append(page.extract_text() or "")
        except Exception as e:
            parts.append(f"\n[Page {i+1} extraction error: {e}]\n")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n\n\f\n\n".join(parts), encoding="utf-8")


def main(argv: List[str]) -> int:
    if len(argv) < 3 or len(argv) % 2 == 0:
        print("Usage: extract_pdf_text.py <in1.pdf> <out1.txt> [<in2.pdf> <out2.txt> ...]", file=sys.stderr)
        return 2
    it = iter(argv[1:])
    for in_p, out_p in zip(it, it):
        extract_pdf_to_text(Path(in_p), Path(out_p))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv))

