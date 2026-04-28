let assets = [];
const NWS_URL = "https://api.weather.gov/alerts/active?event=Tornado%20Warning,Tornado%20Watch,Severe%20Thunderstorm%20Warning,Severe%20Weather%20Statement,Special%20Weather%20Statement";

let audioCtx;
let alarmTriggered = false;
let currentMapLat = 35.385;
let currentMapLon = -94.398;
let currentOverlay = 'radar';

function toggleTheme() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    document.getElementById('themeToggle').textContent = isDark ? '☀️' : '🌓';
}

// Auto-detect system preference
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    toggleTheme();
}

const cardinalMap = {
    'N': 0, 'NORTH': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
    'E': 90, 'EAST': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
    'S': 180, 'SOUTH': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
    'W': 270, 'WEST': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5
};

const usStates = {
    'Alabama':'AL', 'Alaska':'AK', 'Arizona':'AZ', 'Arkansas':'AR', 'California':'CA', 'Colorado':'CO', 'Connecticut':'CT', 'Delaware':'DE', 'Florida':'FL', 'Georgia':'GA', 'Hawaii':'HI', 'Idaho':'ID', 'Illinois':'IL', 'Indiana':'IN', 'Iowa':'IA', 'Kansas':'KS', 'Kentucky':'KY', 'Louisiana':'LA', 'Maine':'ME', 'Maryland':'MD', 'Massachusetts':'MA', 'Michigan':'MI', 'Minnesota':'MN', 'Mississippi':'MS', 'Missouri':'MO', 'Montana':'MT', 'Nebraska':'NE', 'Nevada':'NV', 'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM', 'New York':'NY', 'North Carolina':'NC', 'North Dakota':'ND', 'Ohio':'OH', 'Oklahoma':'OK', 'Oregon':'OR', 'Pennsylvania':'PA', 'Rhode Island':'RI', 'South Carolina':'SC', 'South Dakota':'SD', 'Tennessee':'TN', 'Texas':'TX', 'Utah':'UT', 'Vermont':'VT', 'Virginia':'VA', 'Washington':'WA', 'West Virginia':'WV', 'Wisconsin':'WI', 'Wyoming':'WY', 'District of Columbia':'DC'
};

function formatLocationName(addr, fallback) {
    if (!addr) return fallback.toUpperCase();
    const city = addr.city || addr.town || addr.village || addr.municipality || "";
    const state = addr.state ? (usStates[addr.state] || addr.state.toUpperCase()) : "";
    
    if (city) return `${city}${state ? ', ' + state : ''}`.toUpperCase();
    if (addr.county) return `${addr.county.replace(/ County/i, '')}${state ? ', ' + state : ''}`.toUpperCase();
    return fallback.toUpperCase();
}

window.onload = function() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            currentMapLat = lat;
            currentMapLon = lon;
            reverseGeocode(lat, lon);
        }, () => {
            fetchAlerts();
        });
    } else {
        fetchAlerts();
    }
};

async function reverseGeocode(lat, lon) {
    try {
        const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&addressdetails=1', {
            headers: { 'User-Agent': 'DAISY-Emergency-System/1.0 (contact: daisy-weather-app@example.com)' }
        });
        const data = await res.json();
        const name = formatLocationName(data.address, "MY LOCATION");
        
        // Add as an asset but check if it already exists to avoid duplicates
        if (!assets.some(a => Math.abs(a.lat - lat) < 0.01 && Math.abs(a.lon - lon) < 0.01)) {
            assets.push({ id: 'current-' + Date.now(), name: name, lat: lat, lon: lon });
            renderAssets();
        }
        updateMap();
        fetchAlerts();
    } catch (e) {
        console.error("Reverse geocode failed", e);
        assets.push({ id: 'current-' + Date.now(), name: "MY LOCATION", lat: lat, lon: lon });
        renderAssets();
        updateMap();
        fetchAlerts();
    }
}

function setMapMode(mode) {
    currentOverlay = mode;
    const radarBtn = document.getElementById('modeRadar');
    const gustBtn = document.getElementById('modeGust');
    
    radarBtn.classList.remove('active', 'bg-white', 'dark:bg-slate-800', 'shadow-sm', 'border');
    gustBtn.classList.remove('active', 'bg-white', 'dark:bg-slate-800', 'shadow-sm', 'border');
    radarBtn.classList.add('text-slate-500');
    gustBtn.classList.add('text-slate-500');

    const activeBtn = mode === 'radar' ? radarBtn : gustBtn;
    activeBtn.classList.add('active', 'bg-white', 'dark:bg-slate-800', 'shadow-sm', 'border');
    activeBtn.classList.remove('text-slate-500');
    
    updateMap();
}

function updateMap() {
    const map = document.getElementById('radarMap');
    if (!map) return;
    const zoom = assets.length > 0 ? 8 : 6;
    map.src = 'https://embed.windy.com/embed2.html?lat=' + currentMapLat + '&lon=' + currentMapLon + '&zoom=' + zoom + '&level=surface&overlay=' + currentOverlay + '&product=' + (currentOverlay === 'radar' ? 'radar' : 'wind') + '&message=true';
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

let alarmLevel = 0; // 0: none, 1: watch, 2: warning, 3: emergency/pds
let alarmInterval;
let hapticInterval;

function triggerHaptics(level) {
    if (!navigator.vibrate || !document.getElementById('prefVibrate').checked) return;
    if (level === 3) {
        // S-O-S Pattern
        navigator.vibrate([100,100,100,100,100, 300,300,300,300,300, 100,100,100,100,100]);
    } else if (level === 2) {
        navigator.vibrate([500, 500, 500]);
    }
}

function triggerFlash(level, isTornado = false) {
    if (!document.getElementById('prefFlash').checked) {
        document.body.classList.remove('flash-active');
        return;
    }
    // Flash ONLY if it's a level 2+ alarm AND rotation or a specific tornado event is detected.
    // Note: isTornado is pre-filtered in processAlerts to exclude lower-threat "Tornado Possible" tags.
    if (level >= 2 && isTornado) {
        document.body.classList.add('flash-active');
    } else {
        document.body.classList.remove('flash-active');
    }
}

function stopAlarm() {
    if (alarmInterval) clearInterval(alarmInterval);
    alarmLevel = 0;
    document.body.classList.remove('flash-active');
}

function playAlarm(level, isTornado = false) {
    // Note: Visual triggerFlash is now handled directly in processAlerts to avoid redundant logic here
    if (!audioCtx || !document.getElementById('prefAudio').checked) return;
    
    // Trigger haptics on new/higher threat levels
    triggerHaptics(level);
    
    // Set new level and clear old interval
    alarmLevel = level;
    if (alarmInterval) clearInterval(alarmInterval);
    
    let beepCount = 0;
    const frequency = level === 3 ? 1200 : (level === 2 ? 880 : 440);
    const duration = level === 3 ? 0.8 : (level === 2 ? 0.4 : 0.2);
    const pause = level === 3 ? 200 : (level === 2 ? 600 : 2000);

    alarmInterval = setInterval(() => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = level === 3 ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime); 
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
        
        beepCount++;
        if (level < 3 && beepCount >= 10) {
            clearInterval(alarmInterval);
            alarmLevel = 0;
        }
    }, pause);
}

function testAlarm() {
    initAudio();
    playAlarm(2, true); // Pass true so the user can verify flashing works during test
    setTimeout(() => {
        if (alarmInterval) clearInterval(alarmInterval);
        alarmLevel = 0;
        document.body.classList.remove('flash-active');
    }, 3000);
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8;
    const dLat = (lat2-lat1) * Math.PI / 180;
    const dLon = (lon2-lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getBearing(lat1, lon1, lat2, lon2) {
    const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function getMinPolygonDistance(assetLat, assetLon, geometryCoordinates) {
    let minDist = 9999;
    let closestPt = null;
    let isInside = false;

    function traverse(arr) {
        if (!Array.isArray(arr)) return;
        // If it's a coordinate pair [lon, lat]
        if (arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
            const d = getDistance(assetLat, assetLon, arr[1], arr[0]);
            if (d < minDist) { minDist = d; closestPt = arr; }
        } else {
            // Check if this level of the array is a polygon ring
            if (Array.isArray(arr[0]) && typeof arr[0][0] === 'number') {
                if (isPointInPolygon(assetLat, assetLon, arr)) isInside = true;
            }
            for (let i = 0; i < arr.length; i++) { traverse(arr[i]); }
        }
    }
    traverse(geometryCoordinates);
    return { minDist, closestPt, isInside };
}

function isPointInPolygon(lat, lon, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i][0], yi = polygon[i][1];
        let xj = polygon[j][0], yj = polygon[j][1];
        let intersect = ((yi > lat) !== (yj > lat))
            && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

async function fetchAlerts() {
    try {
        const response = await fetch(NWS_URL);
        if (!response.ok) throw new Error('NWS API Error: ' + response.status);
        const data = await response.json();
        processAlerts(data.features || []);
        document.getElementById('lastSync').textContent = "LIVE: " + new Date().toLocaleTimeString();
    } catch (err) { 
        document.getElementById('lastSync').textContent = "OFFLINE";
    }
}

if (typeof window.isFirstLoad === 'undefined') window.isFirstLoad = true;
if (typeof window.previousAlertSignatures === 'undefined') window.previousAlertSignatures = new Set();

function showToast(message) {
    const t = document.createElement('div');
    t.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-full font-black text-sm shadow-[0_0_20px_rgba(37,99,235,0.5)] z-[100] flex items-center gap-3 border-2 border-blue-400 transition-all duration-500 -translate-y-20 opacity-0';
    t.innerHTML = '<span>🔄</span> ' + message;
    document.body.appendChild(t);
    
    setTimeout(() => {
        t.classList.remove('-translate-y-20', 'opacity-0');
        t.classList.add('translate-y-0', 'opacity-100');
    }, 10);
    
    setTimeout(() => {
        t.classList.remove('translate-y-0', 'opacity-100');
        t.classList.add('-translate-y-20', 'opacity-0');
        setTimeout(() => t.remove(), 500);
    }, 6000);
}

function processAlerts(features) {
    const container = document.getElementById('alertsContainer');
    container.innerHTML = '';
    let highestAlarmLevel = 0;
    let highestTornadoLevel = 0;
    let hasActiveWarning = false;

    let currentSignatures = new Set();
    let newUpdates = 0;

    // Remove the body-level reset here to avoid flickering; triggerFlash will handle it at the end of processAlerts
    // document.body.classList.remove('flash-active');
    if (features.length === 0) {
        container.innerHTML = `
            <div class="col-span-full bg-green-600 dark:bg-green-700 text-white rounded-3xl p-12 text-center shadow-lg border-4 border-green-500">
                <h2 class="text-fluid-massive font-black mb-4">CLEAR</h2>
                <p class="text-fluid-body font-bold uppercase tracking-widest">NO ACTIVE THREATS</p>
                <p class="text-sm font-medium mt-4 text-green-200">System Standing By</p>
            </div>
        `;
    } else {
        features.forEach(f => {
        const props = f.properties || {};
        const description = (props.description || "").toUpperCase();
        const text = description + " " + (props.instruction || "").toUpperCase();
        const event = (props.event || "").toUpperCase();
        
        const hasRotation = text.includes("ROTATION") || text.includes("RADAR INDICATED TORNADO") || text.includes("TORNADIC");
        const hasFunnel = text.includes("FUNNEL");
        const hasObserved = text.includes("OBSERVED") || text.includes("CONFIRMED") || text.includes("TORNADO ON THE GROUND") || text.includes("TORNADO...OBSERVED");
        const hasPossible = text.includes("TORNADO...POSSIBLE") || text.includes("INDICATED TORNADO") || text.includes("DEVELOPING ROTATION");
        const hasEmergency = text.includes("TORNADO EMERGENCY") || text.includes("PARTICULARLY DANGEROUS SITUATION") || text.includes("PDS") || event.includes("EMERGENCY");
        const isDestructiveStorm = text.includes("DESTRUCTIVE") || text.includes("80 MPH") || text.includes("90 MPH") || text.includes("100 MPH");

        f.keywords = {
            rotation: hasRotation,
            funnel: hasFunnel,
            observed: hasObserved,
            possible: hasPossible,
            emergency: hasEmergency,
            
            destructive: isDestructiveStorm,
            vector: text.match(/MOVING (\w+) AT (\d+) MPH/)
        };

        let snippet = "";
        const lines = description.split('\n');
        const hazardLine = lines.find(l => l.includes('HAZARD...') || l.includes('IMPACT...')) || "";
        if (hazardLine) snippet = hazardLine.replace(/HAZARD\.\.\.|IMPACT\.\.\./g, '').trim();

        f.snippet = snippet;
        f.minDist = 999;
        f.isDirectHit = false;
        
        if (assets.length > 0) {
            if (f.geometry && f.geometry.coordinates) {
                let overallMinDist = 9999;
                let bestPt = null;
                let isInsidePolygon = false;
                assets.forEach(a => {
                    const result = getMinPolygonDistance(a.lat, a.lon, f.geometry.coordinates);
                    if (result.isInside) isInsidePolygon = true;
                    if (result.minDist < overallMinDist) {
                        overallMinDist = result.minDist;
                        bestPt = result.closestPt;
                    }
                });
                
                if (isInsidePolygon) {
                    f.minDist = 0;
                    f.isDirectHit = true;
                } else if (bestPt && overallMinDist < 9999) {
                    f.minDist = overallMinDist;
                    if (f.keywords.vector) {
                        const stormDir = cardinalMap[f.keywords.vector[1].toUpperCase()];
                        if (stormDir !== undefined) {
                            f.headedTowards = assets.some(a => {
                                const bearingToAsset = getBearing(bestPt[1], bestPt[0], a.lat, a.lon);
                                const diff = Math.abs(stormDir - bearingToAsset);
                                return Math.min(diff, 360 - diff) < 45; 
                            });
                        }
                        if (f.headedTowards) {
                            const speedMph = parseInt(f.keywords.vector[2], 10);
                            if (speedMph > 0) f.etaMinutes = Math.round((f.minDist / speedMph) * 60);
                        }
                    }
                }
            }

            // Zone Matching Fallback: If distance calculation fails or you are inside the massive watch polygon
            assets.forEach(a => {
                // Extract county from asset name (e.g., "CRAWFORD" from "CRAWFORD COUNTY, AR")
                const cleanName = a.name.toUpperCase().replace(/ COUNTY/g, '').replace(/ PARISH/g, '');
                const parts = cleanName.split(',').map(p => p.trim());
                parts.forEach(part => {
                    // Match if the county name is > 3 letters and appears in the NWS Alert area description
                    if (part.length > 3 && props.areaDesc && props.areaDesc.toUpperCase().includes(part)) {
                        f.isDirectHit = true;
                        if (f.minDist > 5) f.minDist = 0; // Force sorting to the top
                    }
                });
            });
        }
    });

    const uniqueFeatures = features.filter((v,i,a)=>a.findIndex(t=>(t.properties.id === v.properties.id))===i);
    uniqueFeatures.sort((a, b) => a.minDist - b.minDist);

    uniqueFeatures.forEach(f => {
        const sig = f.properties.id + '-' + (f.minDist < 999 ? f.minDist.toFixed(1) : 'NA') + '-' + (f.snippet || '');
        currentSignatures.add(sig);
        
        f.justUpdated = false;
        if (!window.isFirstLoad && !window.previousAlertSignatures.has(sig)) {
            if (f.isDirectHit || f.minDist < 50) {
                f.justUpdated = true;
                newUpdates++;
            }
        }

        const props = f.properties || {};
        const event = (props.event || "").toUpperCase();
        const text = (props.description || "").toUpperCase() + " " + (props.instruction || "").toUpperCase();
        
        const isClose = f.minDist < 25 || f.isDirectHit;
        const isImminent = (f.etaMinutes !== undefined && f.etaMinutes <= 45) || (f.isDirectHit && !event.includes('WATCH'));
        const isDangerous = f.keywords.rotation || f.keywords.observed || f.keywords.funnel;
        const isEmergency = f.keywords.emergency;
        const isDeveloping = f.keywords.possible;

        let stateClass = '';
        const isTornado = event.includes('TORNADO') || isDangerous;
        // Adaptive Flash: Include "Tornado Possible" in the flash trigger ONLY if it is a direct threat
        const isTornadoFlashTrigger = isTornado || (isDeveloping && (f.isDirectHit || f.headedTowards));
        const isTornadoPotential = isTornado || isDeveloping;

        if (isEmergency && isImminent) {
            stateClass = 'card-emergency-pds';
            highestAlarmLevel = 3;
            if (isTornadoFlashTrigger) highestTornadoLevel = Math.max(highestTornadoLevel, 3);
        } else if (isDangerous || isDeveloping) {
            stateClass = isClose || (f.etaMinutes && f.etaMinutes < 20) ? 'card-emergency' : 'card-rotation-red';
            if (isImminent) {
                highestAlarmLevel = Math.max(highestAlarmLevel, 2);
                if (isTornadoFlashTrigger) highestTornadoLevel = Math.max(highestTornadoLevel, 2);
            }
        } 
        else if (event.includes('WARNING')) {
            stateClass = 'card-warning';
            if (isImminent) {
                highestAlarmLevel = Math.max(highestAlarmLevel, 2);
                if (isTornadoFlashTrigger) highestTornadoLevel = Math.max(highestTornadoLevel, 2);
            }
        } else if (event.includes('WATCH')) {
            stateClass = 'card-watch';
            if (isImminent) {
                highestAlarmLevel = Math.max(highestAlarmLevel, 1);
                if (isTornadoPotential) highestTornadoLevel = Math.max(highestTornadoLevel, 1);
            }
        } else {
            stateClass = 'card-calm';
        }

        if (event.includes('WARNING')) hasActiveWarning = true;

        let distBg = 'bg-slate-100 dark:bg-slate-800 text-slate-500';
        let distText = f.minDist < 999 ? f.minDist.toFixed(1) + ' Miles' : 'WATCH AREA';
        let distSubtext = 'MONITOR SYSTEM';

        if (assets.length === 0) {
            distBg = 'bg-blue-600 text-white'; distText = '[SCANNING]'; distSubtext = 'PIN LOCATION TO TRACK';
        } else if (f.isDirectHit) {
            if (event.includes('WATCH')) {
                distText = 'IN YOUR AREA';
                distBg = 'bg-amber-500 text-white';
                distSubtext = 'BE PREPARED';
            } else {
                distText = 'TAKE COVER NOW';
                distBg = 'bg-red-600 text-white animate-pulse';
                distSubtext = 'GO TO BASEMENT OR INTERIOR ROOM';
            }
        } else if (isImminent && (isDangerous || isDeveloping)) {
            distText = 'IMMINENT THREAT';
            distBg = 'bg-red-600 text-white animate-pulse'; distSubtext = 'TAKE COVER SOON';
        } else if (f.minDist <= 50) {
            distBg = 'bg-orange-500 text-white'; distSubtext = 'REGIONAL SYSTEM';
        }

        const card = document.createElement('div');
        card.className = `alert-card ${stateClass}`;
        
        let tagsHtml = '';
        if (f.headedTowards) tagsHtml += '<span class="keyword-tag bg-blue-600 text-white ring-2 ring-blue-400">HEADED TOWARDS YOU</span>';
        if (f.etaMinutes !== undefined) tagsHtml += `<span class="keyword-tag bg-slate-900 text-white">ETA: ${f.etaMinutes} MINS</span>`;
        if (isEmergency) tagsHtml += '<span class="keyword-tag bg-black text-red-500 animate-bounce">TORNADO EMERGENCY</span>';
        if (f.keywords.observed) tagsHtml += '<span class="keyword-tag bg-red-700 text-white">CONFIRMED TORNADO</span>';
        if (f.keywords.rotation) tagsHtml += '<span class="keyword-tag bg-orange-600 text-white">ROTATION DETECTED</span>';
        if (f.keywords.funnel) tagsHtml += '<span class="keyword-tag bg-amber-700 text-white">FUNNEL CLOUD</span>';
        if (f.keywords.destructive) tagsHtml += '<span class="keyword-tag bg-red-800 text-white">DESTRUCTIVE WINDS</span>';
        if (f.keywords.possible && !f.keywords.observed) tagsHtml += '<span class="keyword-tag bg-amber-600 text-white">TORNADO POSSIBLE</span>';
        if (f.keywords.vector) tagsHtml += `<span class="keyword-tag bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">${f.keywords.vector[1]} @ ${f.keywords.vector[2]} MPH</span>`;
        if (f.justUpdated) tagsHtml = '<span class="keyword-tag bg-green-500 text-white animate-pulse ring-2 ring-green-300">NEW DETAILS</span> ' + tagsHtml;

        let safetyHtml = '';
        if (f.isDirectHit && event.includes('WARNING')) {
            safetyHtml = `
                <div class="safety-action-box">
                    <p class="text-lg">🚨 TAKE SHELTER NOW 🚨</p>
                    <p class="text-xs mt-1">INTERIOR ROOM / BASEMENT. COVER HEAD. HELMETS ON.</p>
                </div>
            `;
        }

        card.setAttribute('role', 'alert');
        card.setAttribute('aria-label', `${f.properties.event} for ${f.properties.areaDesc}`);
        card.innerHTML = `
            <div class="alert-bar-top" role="header">${f.properties.event}</div>
            <div class="alert-inner-container">
                <div class="w-full text-center p-4 mb-4 rounded-xl flex flex-col ${distBg}" role="status">
                    <span class="text-3xl font-black">${distText}</span>
                    <span class="text-[10px] uppercase font-bold tracking-[0.2em] mt-1">${distSubtext}</span>
                </div>
                <div class="notification-box font-bold text-center">${f.properties.areaDesc}</div>
                ${f.snippet ? `<div class="threat-detail" role="note">REPORTED: ${f.snippet}</div>` : ''}
                ${safetyHtml}
                <div class="mt-6 flex flex-wrap justify-center gap-2">
                    ${tagsHtml}
                </div>
            </div>
            <div class="alert-bar-bottom">EXPIRES: ${new Date(f.properties.expires).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        `;
        container.appendChild(card);
    });
    }

    window.previousAlertSignatures = currentSignatures;
    window.isFirstLoad = false;
    
    if (newUpdates > 0) {
        showToast(`${newUpdates} ALERT${newUpdates > 1 ? 'S' : ''} UPDATED WITH NEW NWS DATA`);
        if (navigator.vibrate && document.getElementById('prefVibrate').checked) {
            navigator.vibrate([200, 100, 200]);
        }
    }

    // Always call triggerFlash to ensure visual state is current
    triggerFlash(highestAlarmLevel, highestTornadoLevel >= 2);

    // Smart Alarm: Only play/re-trigger audio if the level increased OR if there's a new alert update
    if (highestAlarmLevel > alarmLevel || (newUpdates > 0 && highestAlarmLevel > 0)) {
        playAlarm(highestAlarmLevel, highestTornadoLevel >= 2);
    } else if (highestAlarmLevel === 0 && alarmLevel > 0) {
        // Clear alarm if all threats are gone
        stopAlarm();
    }

    // Adjust sync frequency: 30s balance for "Ultimate Advantage" and API health
    if (window.fetchIntervalTime !== 60000) {
        clearInterval(window.fetchInterval);
        window.fetchIntervalTime = 60000;
        window.fetchInterval = setInterval(fetchAlerts, 60000);
    }
}

async function addAsset() {
    initAudio(); 
    const input = document.getElementById('addrIn');
    const btn = document.getElementById('pinBtn');
    let val = input.value.trim();
    if (!val) return;
    
    const originalBtnText = btn.textContent;
    btn.textContent = "SEARCHING...";
    btn.disabled = true;
    
    try {
        const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(val) + '&countrycodes=us&addressdetails=1&limit=1', {
            headers: { 'User-Agent': 'DAISY-Emergency-System/1.0 (contact: daisy-weather-app@example.com)' }
        });
        const data = await res.json();
        if (data.length > 0) {
            const displayName = formatLocationName(data[0].address, val);
            
            currentMapLat = parseFloat(data[0].lat);
            currentMapLon = parseFloat(data[0].lon);
            assets.push({ id: Date.now(), name: displayName, lat: currentMapLat, lon: currentMapLon });
            input.value = '';
            updateMap();
            renderAssets();
            fetchAlerts();
        } else {
            alert("LOCATION NOT FOUND. PLEASE TRY A ZIP CODE OR FULL CITY NAME.");
        }
    } catch (e) { 
        console.error(e);
        alert("SEARCH FAILED. PLEASE CHECK YOUR CONNECTION.");
    } finally {
        btn.textContent = originalBtnText;
        btn.disabled = false;
    }
}

function renderAssets() {
    const list = document.getElementById('assetList');
    list.innerHTML = assets.map(a => 
        '<div class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between gap-4 shadow-sm" role="listitem">' +
            '<span class="text-xs font-bold uppercase truncate">' + a.name + '</span>' +
            '<button onclick="assets=assets.filter(x=>x.id!==' + (typeof a.id === 'string' ? ("'" + a.id + "'") : a.id) + ');renderAssets();fetchAlerts()"' + 
                    ' class="text-slate-400 hover:text-red-500 transition-colors font-bold"' +
                    ' aria-label="Remove ' + a.name + '">×</button>' +
        '</div>'
    ).join('');
}

async function shareApp() {
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'DAISY: Emergency System',
                url: window.location.href
            });
            return;
        } catch (err) {
            if (err.name !== 'AbortError') console.error('Share failed:', err);
        }
    }
    
    try {
        await navigator.clipboard.writeText(window.location.href);
        document.getElementById('shareBtn').textContent = "LINK COPIED";
    } catch (err) {
        const el = document.createElement('textarea');
        el.value = window.location.href;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        document.getElementById('shareBtn').textContent = "LINK COPIED";
    }
    setTimeout(() => { document.getElementById('shareBtn').textContent = "SHARE DAISY"; }, 2000);
}

window.fetchIntervalTime = 60000;
window.fetchInterval = setInterval(fetchAlerts, 60000); 

// PWA Installation Logic
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBtn').classList.remove('hidden');
});

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                document.getElementById('installBtn').classList.add('hidden');
            }
            deferredPrompt = null;
        });
    }
}
