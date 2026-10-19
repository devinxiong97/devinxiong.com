"""
Make Brazilian Portuguese audio for the course with Amazon Polly.

Run in AWS CloudShell:
    python3 make_audio.py --week 1

It reads portuguese/data/week-01.json from the S3 bucket, finds every
Portuguese phrase, has Polly's neural Brazilian voice say it, and saves
portuguese/audio/<id>.mp3 back to the bucket. Phrases that already have audio
are skipped, so re-running costs nothing extra.

The <id> is the first 16 hex characters of the SHA-1 of the phrase. course.js
computes the same id in the browser to find the recording.
"""

import argparse
import hashlib
import json
import re

import boto3
from botocore.exceptions import ClientError

BUCKET = "devin-xiong-resume"
PREFIX = "portuguese"
PHRASE = re.compile(r"\[\[(.+?)\]\]")


def audio_id(text):
    return hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:16]


def collect(value, found):
    """Every [[Portuguese]] phrase in any string, anywhere in the lesson."""
    if isinstance(value, str):
        found.update(m.strip() for m in PHRASE.findall(value))
    elif isinstance(value, list):
        for v in value:
            collect(v, found)
    elif isinstance(value, dict):
        for v in value.values():
            collect(v, found)


def phrases_in(lesson):
    found = set()
    collect(lesson, found)
    for section in lesson.get("sections", []):
        for pair in section.get("phrases", []):
            found.add(pair[0].strip())
    for card in lesson.get("flashcards", []):
        found.add(card[0].strip())
    for drill in lesson.get("drills", []):
        answer = drill["answer"]
        found.add((answer[0] if isinstance(answer, list) else answer).strip())
    return sorted(p for p in found if p)


def exists(s3, key):
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return True
    except ClientError:
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--week", type=int, required=True)
    parser.add_argument("--voice", default="Camila", help="Camila, Vitoria, or Thiago")
    parser.add_argument("--region", default="us-east-1", help="a region with Polly neural voices")
    args = parser.parse_args()

    s3 = boto3.client("s3")
    polly = boto3.client("polly", region_name=args.region)

    key = f"{PREFIX}/data/week-{args.week:02d}.json"
    lesson = json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    phrases = phrases_in(lesson)
    print(f"Week {args.week}: {len(phrases)} phrases, voice {args.voice}")

    made = skipped = chars = 0
    for text in phrases:
        out_key = f"{PREFIX}/audio/{audio_id(text)}.mp3"
        if exists(s3, out_key):
            skipped += 1
            continue
        speech = polly.synthesize_speech(
            Text=text, VoiceId=args.voice, Engine="neural",
            LanguageCode="pt-BR", OutputFormat="mp3",
        )
        s3.put_object(
            Bucket=BUCKET, Key=out_key, Body=speech["AudioStream"].read(),
            ContentType="audio/mpeg", CacheControl="public, max-age=31536000",
        )
        made += 1
        chars += len(text)
        print(f"  ✓ {text}")

    cost = chars / 1_000_000 * 16
    print(f"Done: {made} new recordings ({chars} characters, about ${cost:.4f}), {skipped} already existed.")


if __name__ == "__main__":
    main()
