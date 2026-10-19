"""
Visit counter - AWS Lambda function for devinxiong.com.

CloudFront forwards /api/visit to this function and adds two headers:
  - CloudFront-Viewer-Country: the visitor's two-letter country code
  - x-origin-verify: a shared secret, so only CloudFront can call this

Only the country code is stored. No IP addresses, cookies, or personal data.

  GET /api/visit?count=1  -> add one visit, then return the stats
  GET /api/visit?count=0  -> just return the stats

No extra libraries needed: boto3 is built into the Lambda Python runtime, so
this code can be pasted straight into the Lambda console editor.
"""

import hmac
import json
import os
import re

import boto3

TABLE_NAME = os.environ.get("TABLE_NAME", "site-visits")
ORIGIN_SECRET = os.environ.get("ORIGIN_SECRET", "")
TOP_COUNTRIES = 10

table = boto3.resource("dynamodb").Table(TABLE_NAME)


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
        "body": json.dumps(body),
    }


def _add_visit(key):
    # ADD creates the item and attribute on first use, so no setup is needed.
    table.update_item(
        Key={"id": key},
        UpdateExpression="ADD visits :one",
        ExpressionAttributeValues={":one": 1},
    )


def _read_stats():
    items, kwargs = [], {}
    while True:
        page = table.scan(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    total = 0
    countries = []
    for item in items:
        visits = int(item.get("visits", 0))
        if item["id"] == "total":
            total = visits
        elif item["id"].startswith("country#"):
            countries.append({"code": item["id"].split("#", 1)[1], "visits": visits})

    countries.sort(key=lambda c: c["visits"], reverse=True)
    return {"total": total, "country_count": len(countries), "countries": countries[:TOP_COUNTRIES]}


def lambda_handler(event, context):
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}

    # Only CloudFront knows the secret, so direct calls to the Function URL are refused.
    if not ORIGIN_SECRET or not hmac.compare_digest(headers.get("x-origin-verify", ""), ORIGIN_SECRET):
        return _response(403, {"error": "Forbidden"})

    params = event.get("queryStringParameters") or {}
    if params.get("count") == "1":
        country = headers.get("cloudfront-viewer-country", "").upper()
        if not re.fullmatch(r"[A-Z]{2}", country):
            country = "XX"  # unknown
        _add_visit("total")
        _add_visit(f"country#{country}")

    return _response(200, _read_stats())
