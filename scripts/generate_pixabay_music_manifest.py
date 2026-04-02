from __future__ import annotations

import csv
import json
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
URL_FILE = ROOT / "scripts" / "pixabay-travel-music-urls.txt"
TRACKS_DIR = ROOT / "backend" / "uploads" / "music" / "pixabay" / "tracks"
MANIFEST_DIR = ROOT / "backend" / "uploads" / "music" / "pixabay" / "manifests"
CSV_PATH = MANIFEST_DIR / "pixabay_music_manifest.csv"
JSON_PATH = MANIFEST_DIR / "pixabay_music_manifest.json"
MISSING_CSV_PATH = MANIFEST_DIR / "pixabay_music_missing.csv"

TRACK_ID_RE = re.compile(r"-(\d+)(?:\.mp3)?$")
URL_RE = re.compile(r"^https://pixabay\.com/music/([^/]+)-(\d+)/?$")


SECTION_DEFAULTS = {
    "Travel cinematic / opening": {
        "mood_tags": "cinematic|hopeful|opening",
        "energy": 3,
        "scene_fit": "opening|landscape|montage",
    },
    "Nature / calm / healing": {
        "mood_tags": "calm|healing|nature",
        "energy": 2,
        "scene_fit": "nature|landscape|healing",
    },
    "Daylight / happy / urban walk": {
        "mood_tags": "happy|light|daylight",
        "energy": 3,
        "scene_fit": "street|walk|cafe|daylight",
    },
    "Lounge / lofi / night city": {
        "mood_tags": "lofi|lounge|night",
        "energy": 2,
        "scene_fit": "night|city|lounge|cafe",
    },
    "Optional trendier vlog cuts": {
        "mood_tags": "vlog|modern|light-groove",
        "energy": 3,
        "scene_fit": "vlog|city|montage",
    },
    "Cinematic / emotional / documentary-friendly": {
        "mood_tags": "cinematic|emotional|documentary",
        "energy": 2,
        "scene_fit": "documentary|landscape|voiceover",
    },
    "Travel acoustic / indie / road trip": {
        "mood_tags": "acoustic|indie|road-trip",
        "energy": 4,
        "scene_fit": "roadtrip|daylight|people|walk",
    },
    "Cafe / lounge / city / lifestyle": {
        "mood_tags": "cafe|lounge|lifestyle",
        "energy": 2,
        "scene_fit": "cafe|food|city|lifestyle",
    },
    "Sunset / tropical / beach": {
        "mood_tags": "sunset|tropical|beach",
        "energy": 3,
        "scene_fit": "sunset|beach|sea|tropical",
    },
    "Calm / nature / reflective": {
        "mood_tags": "reflective|nature|peaceful",
        "energy": 1,
        "scene_fit": "nature|reflection|slow",
    },
    "Urban / montage / extra lofi options": {
        "mood_tags": "urban|montage|lofi",
        "energy": 3,
        "scene_fit": "city|montage|night|walk",
    },
}


@dataclass
class UrlEntry:
    selection_bucket: str
    source_url: str
    source_slug: str
    source_track_id: str
    title: str


@dataclass
class ManifestEntry:
    provider: str
    selection_bucket: str
    title: str
    artist_slug: str
    source_track_id: str
    source_slug: str
    source_url: str
    local_filename: str
    relative_url: str
    mood_tags: str
    energy: int
    scene_fit: str
    recommended_start_sec: int
    recommended_end_sec: int
    fade_in_ms: int
    fade_out_ms: int
    status: str


def extract_track_id(value: str) -> str | None:
    match = TRACK_ID_RE.search(value)
    if not match:
        return None
    return match.group(1)


def humanize_slug(slug: str) -> str:
    parts = [part for part in unquote(slug).split("-") if part and not part.isdigit()]
    return " ".join(part.capitalize() for part in parts)


def normalize_token(token: str) -> str:
    normalized = unicodedata.normalize("NFKD", token)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_only.lower()


def split_artist_and_title(filename: str, source_slug: str, track_id: str) -> tuple[str, str]:
    stem = filename.removesuffix(".mp3")
    suffix = f"-{track_id}"
    if stem.endswith(suffix):
        stem = stem[: -len(suffix)]

    file_tokens = [token for token in stem.split("-") if token]
    source_tokens = [token for token in unquote(source_slug).split("-") if token]
    normalized_file_tokens = [normalize_token(token) for token in file_tokens]
    normalized_source_tokens = [normalize_token(token) for token in source_tokens]

    overlap = 0
    max_overlap = min(len(file_tokens), len(source_tokens))
    for size in range(max_overlap, 0, -1):
        if normalized_file_tokens[-size:] == normalized_source_tokens[-size:]:
            overlap = size
            break

    if overlap > 0:
        artist_tokens = file_tokens[:-overlap]
        title_tokens = file_tokens[-overlap:]
    else:
        artist_tokens = file_tokens[:1]
        title_tokens = file_tokens[1:] or file_tokens

    artist_slug = "-".join(artist_tokens)
    title_slug = "-".join(title_tokens)
    return artist_slug, humanize_slug(title_slug)


def parse_url_file(path: Path) -> list[UrlEntry]:
    entries: list[UrlEntry] = []
    current_section = "Uncategorized"

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            current_section = line.lstrip("#").strip()
            continue

        match = URL_RE.match(line)
        if not match:
            continue

        source_slug = match.group(1)
        source_track_id = match.group(2)
        entries.append(
            UrlEntry(
                selection_bucket=current_section,
                source_url=line,
                source_slug=source_slug,
                source_track_id=source_track_id,
                title=humanize_slug(source_slug),
            )
        )

    return entries


def iter_track_files(path: Path) -> Iterable[Path]:
    return sorted(item for item in path.iterdir() if item.is_file() and item.suffix.lower() == ".mp3")


def build_manifest_entries(url_entries: list[UrlEntry], track_files: list[Path]) -> tuple[list[ManifestEntry], list[UrlEntry]]:
    url_by_track_id = {entry.source_track_id: entry for entry in url_entries}
    found_ids: set[str] = set()
    manifest_entries: list[ManifestEntry] = []

    for track_file in track_files:
        track_id = extract_track_id(track_file.name)
        if not track_id:
            continue

        url_entry = url_by_track_id.get(track_id)
        if not url_entry:
            continue

        found_ids.add(track_id)
        defaults = SECTION_DEFAULTS.get(
            url_entry.selection_bucket,
            {"mood_tags": "", "energy": 3, "scene_fit": ""},
        )
        artist_slug, title = split_artist_and_title(
            filename=track_file.name,
            source_slug=url_entry.source_slug,
            track_id=url_entry.source_track_id,
        )
        recommended_start_sec = 8 if defaults["energy"] >= 3 else 6
        recommended_end_sec = -1

        manifest_entries.append(
            ManifestEntry(
                provider="pixabay",
                selection_bucket=url_entry.selection_bucket,
                title=title,
                artist_slug=artist_slug,
                source_track_id=url_entry.source_track_id,
                source_slug=unquote(url_entry.source_slug),
                source_url=url_entry.source_url,
                local_filename=track_file.name,
                relative_url=f"/uploads/music/pixabay/tracks/{track_file.name}",
                mood_tags=defaults["mood_tags"],
                energy=int(defaults["energy"]),
                scene_fit=defaults["scene_fit"],
                recommended_start_sec=recommended_start_sec,
                recommended_end_sec=recommended_end_sec,
                fade_in_ms=1000,
                fade_out_ms=1400,
                status="ready",
            )
        )

    missing = [entry for entry in url_entries if entry.source_track_id not in found_ids]
    manifest_entries.sort(key=lambda item: (item.selection_bucket, item.title, item.source_track_id))
    return manifest_entries, missing


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys()) if rows else []
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    url_entries = parse_url_file(URL_FILE)
    track_files = list(iter_track_files(TRACKS_DIR))
    manifest_entries, missing_entries = build_manifest_entries(url_entries, track_files)

    manifest_rows = [asdict(entry) for entry in manifest_entries]
    missing_rows = [asdict(entry) for entry in missing_entries]

    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    write_csv(CSV_PATH, manifest_rows)
    JSON_PATH.write_text(
        json.dumps(manifest_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_csv(MISSING_CSV_PATH, missing_rows)

    print(f"tracks_found={len(track_files)}")
    print(f"manifest_entries={len(manifest_entries)}")
    print(f"missing_entries={len(missing_entries)}")
    print(CSV_PATH)
    print(JSON_PATH)
    print(MISSING_CSV_PATH)


if __name__ == "__main__":
    main()
