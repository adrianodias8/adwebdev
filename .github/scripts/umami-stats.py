#!/usr/bin/env python3
"""Fetch a few aggregate numbers from Umami for the site's Stats page.

The share link's id comes from UMAMI_SHARE_ID (a GitHub secret) and is traded
for Umami's read-only share token, which never leaves this job. Only totals
and counts are written out, nothing about any one visit: no sessions, no
cities. Writes JSON to stdout; exits non-zero if anything is missing.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

TZ = "Europe/Brussels"
TOP = 8


def main():
    share = os.environ.get("UMAMI_SHARE_ID")
    if not share:
        sys.exit("UMAMI_SHARE_ID is not set")
    site = json.load(open("statico.json"))["site"]
    base = site["umami"].rstrip("/")
    since = datetime.fromisoformat(os.environ["STATS_SINCE"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    start, end = int(since.timestamp() * 1000), int(now.timestamp() * 1000)

    def get(path, token=None, **params):
        url = f"{base}/api/{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = {"User-Agent": "adwebdev-stats", **({"x-umami-share-token": token} if token else {})}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.load(res)

    shared = get(f"share/{share}")
    token, website = shared["token"], shared["websiteId"]
    span = {"startAt": start, "endAt": end}

    def site_get(path, **params):
        return get(f"websites/{website}/{path}", token, **{**span, **params})

    def values(event, prop):
        return site_get("event-data/values", eventName=event, propertyName=prop)

    stats = site_get("stats")
    # Visits per day for the last 30 days, or since the start if that's sooner.
    series = site_get("pageviews", unit="day", timezone=TZ, startAt=max(start, int((now - timedelta(days=29)).timestamp() * 1000)))
    events = {e["x"]: e["y"] for e in site_get("metrics", type="event")}
    paths = site_get("metrics", type="path")
    countries = site_get("metrics", type="country")
    closes = {v["value"]: v["total"] for v in values("close-app", "app")}

    visits = stats.get("visits") or 0
    out = {
        "updated": now.isoformat(timespec="minutes"),
        "since": since.date().isoformat(),
        "totals": {
            "visitors": stats.get("visitors", 0),
            "visits": visits,
            "pageviews": stats.get("pageviews", 0),
            "avg_visit_seconds": round((stats.get("totaltime") or 0) / visits) if visits else 0,
        },
        "days": merge_days(series),
        "apps": [{"app": v["value"], "opens": v["total"]} for v in values("open-app", "app")[:TOP]],
        "posts": [{"path": p["x"], "views": p["y"]} for p in paths if p["x"].startswith("/writing/") and p["x"] != "/writing/"][:TOP],
        "countries": [{"code": c["x"], "visitors": c["y"]} for c in countries if c["x"]][:6],
        "counters": {
            "terminal": events.get("terminal-command", 0),
            "php": events.get("console-command", 0),
            "tools": events.get("use-tool", 0),
            "agent_closed": closes.get("agent", 0),
            "corners": events.get("screensaver-corner", 0),
        },
    }
    json.dump(out, sys.stdout, indent=1)


def merge_days(series):
    """Visits and page views per day, from Umami's two parallel series."""
    days = {}
    for key, field in (("pageviews", "pageviews"), ("sessions", "visits")):
        for point in series.get(key, []):
            days.setdefault(point["x"][:10], {"pageviews": 0, "visits": 0})[field] = point["y"]
    return [{"day": d, **v} for d, v in sorted(days.items())]


if __name__ == "__main__":
    main()
