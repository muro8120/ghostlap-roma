#!/usr/bin/env bash
# Pull the OpenStreetMap data for the Rome routes (Prati -> Vatican / Popolo / Pantheon).
# Writes raw Overpass JSON to tools/osm/ (git-ignored). Needs network access to overpass-api.de.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p osm
BBOX="41.8945,12.4480,41.9160,12.4890"   # south,west,north,east
API="${OVERPASS:-https://overpass-api.de/api/interpreter}"
UA="ghostlap-roma/1.0 (personal offline game; one-off fetch)"
q() { # name, query
  echo "fetching $1..."
  curl -sS --fail --max-time 300 -A "$UA" --data-urlencode "data=$2" "$API" -o "osm/$1.json"
  sleep 2
}
q streets "[out:json][timeout:180];way[\"highway\"][\"highway\"!~\"^(motorway|motorway_link|trunk_link|construction|proposed|platform|bus_stop|elevator|corridor|raceway)$\"][\"area\"!=\"yes\"]($BBOX);out geom;"
q squares "[out:json][timeout:180];(way[\"highway\"=\"pedestrian\"][\"area\"=\"yes\"]($BBOX);way[\"place\"=\"square\"]($BBOX););out geom;"
q buildings "[out:json][timeout:180];way[\"building\"]($BBOX);out tags geom;"
q water "[out:json][timeout:180];(way[\"waterway\"=\"river\"]($BBOX);way[\"natural\"=\"water\"]($BBOX);relation[\"natural\"=\"water\"]($BBOX);relation[\"waterway\"=\"riverbank\"]($BBOX););out geom;"
q places "[out:json][timeout:180];(nwr[\"tourism\"~\"^(attraction|museum|hotel|viewpoint)$\"][\"name\"]($BBOX);nwr[\"railway\"=\"station\"][\"name\"]($BBOX);nwr[\"station\"=\"subway\"][\"name\"]($BBOX);nwr[\"amenity\"~\"^(fountain|place_of_worship)$\"][\"name\"]($BBOX);nwr[\"historic\"][\"name\"]($BBOX);nwr[\"place\"=\"square\"][\"name\"]($BBOX););out center tags;"
echo done
