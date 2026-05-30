# Calorie Tracker Import/Export Format Specification

This document defines the standard JSON schema and format for importing and exporting data in the Calorie Tracker tool.

## Overview

The Calorie Tracker supports importing and exporting logs and configurations. The export file is a single JSON document containing app settings (goals) and saved meal logs. Any associated images are serialized as Base64 data URIs.

## Format Flexibility (1 to N Entries)

To make data sharing and backup as versatile as possible, the Calorie Tracker accepts three variations during import:

1. **Full Envelope (Export Standard)**: Contains app configuration goals and an array of meals.
2. **Raw Array**: A JSON list containing 1 to N meal objects.
3. **Single Entry**: A single JSON meal object.

---

## Unique Identifiers & Deduplication

- **Deduplication Key**: `shortId` (e.g., `MEAL-K9J8H7G6F`) is the stable unique identifier used to match entries.
- **Collision Resolution**: If an imported entry shares a `shortId` with an existing local meal, the local entry is overwritten/updated.
- **Auto-Generation**: If an imported entry does not contain a `shortId`, the system automatically generates a unique ID on the fly.

---

## JSON Schema (Full Envelope)

The formal JSON Schema (Draft-07) for the export format:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CalorieTrackerExport",
  "description": "Export format for Calorie Tracker application containing user goals and meals.",
  "type": "object",
  "required": ["version", "exportedAt", "settings", "meals"],
  "properties": {
    "version": {
      "type": "string",
      "description": "Version of the export format (e.g., '1.0.0')"
    },
    "exportedAt": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of when the export was generated"
    },
    "settings": {
      "type": "object",
      "required": ["calorieGoal", "proteinGoal", "carbsGoal", "fatGoal"],
      "properties": {
        "calorieGoal": {
          "type": "integer",
          "minimum": 0
        },
        "proteinGoal": {
          "type": "integer",
          "minimum": 0
        },
        "carbsGoal": {
          "type": "integer",
          "minimum": 0
        },
        "fatGoal": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "meals": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/meal"
      }
    }
  },
  "definitions": {
    "meal": {
      "type": "object",
      "required": [
        "foodName",
        "calories",
        "protein",
        "carbs",
        "fat",
        "confidence",
        "timestamp",
        "updatedAt"
      ],
      "properties": {
        "shortId": {
          "type": "string",
          "pattern": "^(MEAL|ACT)-[A-Z0-9]{9}$",
          "description": "Unique stable identifier. Auto-generated if omitted."
        },
        "foodName": {
          "type": "string"
        },
        "calories": {
          "type": "number",
          "minimum": 0
        },
        "protein": {
          "type": "number",
          "minimum": 0
        },
        "carbs": {
          "type": "number",
          "minimum": 0
        },
        "fat": {
          "type": "number",
          "minimum": 0
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 100
        },
        "image": {
          "type": ["string", "null"],
          "description": "Base64 data URI of the meal image, or null if no image exists (e.g. 'data:image/jpeg;base64,...')"
        },
        "notes": {
          "type": "string"
        },
        "timestamp": {
          "type": "integer",
          "description": "Unix timestamp in milliseconds of the meal entry"
        },
        "updatedAt": {
          "type": "integer",
          "description": "Unix timestamp in milliseconds of the last update"
        }
      }
    }
  }
}
```

---

## User Interface Actions

Two prominent action buttons are integrated into the **Logged Meals History** header:

1. **Import Button (<i data-lucide="upload"></i> Import)**:
   - Triggers a file browser restricted to `.json` files.
   - Parses the selected JSON file and safely imports all validated meal records.
   - Merges records with matching `shortId` values and populates goals/preferences if settings are present.

2. **Export Button (<i data-lucide="download"></i> Export)**:
   - Exports meals currently matching the active **Filter Duration** select menu (e.g., _Today_, _Last 7 Days_, _Last Month_, _Custom Date_, or _All Time_).
   - Prompts a local download of the generated JSON file containing serialized data and base64 images.

---

## Base64 Image Specification

To ensure compatibility across platforms, images are encoded as standard RFC 2397 Data URIs.

- **Format**: `data:[<mediatype>][;base64],<data>`
- **Supported Media Types**: `image/jpeg`, `image/png`, `image/webp`
- **Example**: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`

### Conversion Procedures (IndexedDB Blob <-> Base64 Data URI)

#### Blob to Base64 (Export Phase)

```javascript
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

#### Base64 to Blob (Import Phase)

```javascript
function dataURIToBlob(dataURI) {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}
```

---

## Example Payload

Below is a complete, valid example payload representing a single meal entry with a placeholder image.

```json
{
  "version": "1.0.0",
  "exportedAt": "2026-05-24T19:56:00.000Z",
  "settings": {
    "calorieGoal": 2000,
    "proteinGoal": 130,
    "carbsGoal": 220,
    "fatGoal": 70
  },
  "meals": [
    {
      "shortId": "MEAL-K9J8H7G6F",
      "foodName": "Avocado Toast with Egg",
      "calories": 380,
      "protein": 14,
      "carbs": 28,
      "fat": 24,
      "confidence": 95,
      "notes": "Added black pepper and chili flakes.",
      "timestamp": 1779652560000,
      "updatedAt": 1779652620000,
      "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    }
  ]
}
```
