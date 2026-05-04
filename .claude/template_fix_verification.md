# Template Fix Verification

## Problem
User was getting error: `"Template not found. Please use a valid template."` when selecting "Clásica" template during presentation generation.

## Root Cause
- Presenton API expects template names: `["general", "modern", "standard", "swift"]`
- XCalificator was sending: `["general", "classic", "modern"]`  
- The template name "classic" is not recognized by Presenton

## Solution
Fixed the template mapping in `backend/app/services/presenton_service.py`:

### Changed TEMPLATES dictionary (lines 26-30):
```python
TEMPLATES = {
    "general":  "general",    # Sencilla (Simple)
    "classic":  "standard",   # Clásica → maps to Presenton's "standard"
    "modern":   "modern",     # Moderna (Modern)
}
```

### Updated template mapping in _generate_via_sync_endpoint (line 136):
```python
# Before: 
"template": template if template in TEMPLATES else "general"

# After:
"template": TEMPLATES.get(template) or "general"
```

This ensures:
1. When frontend sends `plantilla: "classic"` → maps to `"standard"` for Presenton
2. When template is invalid → defaults safely to `"general"`

## Flow Verification
1. Frontend (GenerarPresentacion.jsx): User selects "Clásica" → sends `plantilla: 'classic'`
2. API (presentaciones.py): Receives and forwards to service
3. Service (presenton_service.py):
   - `generate_lesson_presentation()` validates it's a valid key ✓
   - `_generate_with_prompt()` calls sync endpoint with `template='classic'` ✓
   - `_generate_via_sync_endpoint()` maps: `TEMPLATES.get('classic')` → `'standard'` ✓
   - Sends `{"template": "standard", ...}` to Presenton API ✓

## Testing
When user selects:
- "Sencilla" → sends `"general"` → maps to `"general"` ✓
- "Clásica" → sends `"classic"` → maps to `"standard"` ✓  
- "Moderna" → sends `"modern"` → maps to `"modern"` ✓

Invalid template edge case:
- Sends unknown value → `TEMPLATES.get(unknown)` returns None → defaults to `"general"` ✓
