# Severe Weather Ops

A high-frequency severe weather monitoring application designed to provide real-time tornado warnings with direct access to National Weather Service (NWS) data. This tool bypasses standard consumer weather apps by establishing a direct connection to raw VTEC (Valid Time Event Code) strings and executing sub-minute polling for critical threat detection.

## Features

- **Direct NWS API Integration**: Connects directly to the National Weather Service API for raw weather alert data, bypassing typical 5-10 minute refresh cycles.
- **Asset Monitoring**: Pin a specific location (ZIP code or full address) to monitor for tornado warnings and radar-indicated rotation signatures.
- **Regional Sector Scanning**: Displays active tornado warning polygons across your region with real-time updates.
- **Rotation Detection**: Specifically parses alert descriptions for "RADAR INDICATED ROTATION" or "OBSERVED TORNADO" signatures to trigger immediate alerts.
- **Automatic Polling**: Refreshes telemetry every 60 seconds for continuous monitoring.
- **Volatile Memory Protocol**: No cookies, localStorage, or persistent databases— all data wipes on page refresh for maximum privacy.
- **Neon Interface**: Cyberpunk-themed UI with Tailwind CSS for enhanced visibility and urgency.

## Setup & Installation

1. Clone or download this repository.
2. Open `index.html` in any modern web browser (Chrome, Firefox, Safari, Edge).
3. Ensure internet connection for API access.

No additional installation required— the app runs entirely in the browser.

## Usage

1. **Link an Asset**: Enter a ZIP code or full address in the "Asset Target" field and click "Link Asset Telemetry".
2. **Monitor Status**: Once linked, the app will display the location name and begin monitoring for tornado warnings.
3. **View Alerts**: If a tornado warning is active at your location, the status will change to "CRITICAL: TORNADO WARNING" with rotation details if detected.
4. **Regional Feed**: Scroll down to see active tornado warnings across your region.
5. **Automatic Updates**: The app polls for updates every 60 seconds automatically.

## Dependencies

- **Internet Connection**: Required for API calls to NWS and OpenStreetMap services.
- **Modern Web Browser**: Supports HTML5, CSS3, and ES6+ JavaScript.
- **Tailwind CSS**: Loaded via CDN (https://cdn.tailwindcss.com) for styling.

## APIs Used

- **National Weather Service API** (`https://api.weather.gov`): For active weather alerts and tornado warnings.
- **OpenStreetMap Nominatim** (`https://nominatim.openstreetmap.org`): For geocoding addresses to latitude/longitude coordinates.

## Privacy & Security

This application implements a "Volatile Memory Protocol" for maximum user safety:
- No persistent storage of location data.
- All coordinates and alert data are purged on page refresh.
- Data remains local to the active browser session only.

## Disclaimer

**This is not a substitute for official NOAA National Weather Service broadcasting hardware.** Always keep a battery-powered weather radio active during severe weather events. This tool provides supplemental monitoring but cannot guarantee delivery of alerts in all circumstances (network issues, browser crashes, etc.).

## License

[Add your license here, e.g., MIT License]
