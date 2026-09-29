async function getOverpassData(lat, lon, radius) {
    const query = `
        [out:json][timeout:25];
        (
            way["landuse"](around:${radius},${lat},${lon});
            way["leisure"](around:${radius},${lat},${lon});
            way["natural"](around:${radius},${lat},${lon});
            way["building"](around:${radius},${lat},${lon});
            way["amenity"](around:${radius},${lat},${lon});
        );
        out body geom;
    `;

    const url =
        "https://overpass-api.de/api/interpreter?data=" +
        encodeURIComponent(query);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Failed to fetch OpenStreetMap data.");
    }

    return await response.json();
}

function analyzeLandUse(landUseData) {
    const landCategories = {
        residential: ["residential", "apartments", "house"],
        commercial: ["retail", "commercial", "shop", "marketplace"],
        industrial: ["industrial", "factory", "warehouse", "construction"],
        recreational: ["park", "playground", "sports_centre", "garden"],
        natural: ["grass", "forest", "beach", "water", "wetland"],
        agricultural: ["farmland", "orchard", "vineyard", "greenhouse"],
        infrastructure: ["parking", "railway", "highway", "transportation"]
    };

    const analysis = {
        land_features: {},
        detailed_breakdown: {},
        environmental_metrics: {
            green_space_ratio: 0,
            urban_density: 0,
            natural_buffer_zones: 0
        }
    };

    for (const category of Object.keys(landCategories)) {
        analysis.land_features[category] = 0;
    }

    let totalElements = 0;

    for (const element of landUseData.elements || []) {
        const tags = element.tags || {};

        for (const tagKey of [
            "landuse",
            "leisure",
            "natural",
            "building",
            "amenity"
        ]) {
            if (!tags[tagKey]) continue;

            const landType = tags[tagKey];

            analysis.detailed_breakdown[landType] =
                (analysis.detailed_breakdown[landType] || 0) + 1;

            for (const [category, types] of Object.entries(landCategories)) {
                if (types.includes(landType)) {
                    analysis.land_features[category]++;
                    break;
                }
            }

            totalElements++;
        }
    }

    if (totalElements > 0) {
        for (const category of Object.keys(analysis.land_features)) {
            analysis.land_features[category] =
                Number(
                    (
                        (analysis.land_features[category] / totalElements) *
                        100
                    ).toFixed(2)
                );
        }

        const greenSpace =
            analysis.land_features.natural +
            analysis.land_features.recreational;

        const urbanSpace =
            analysis.land_features.residential +
            analysis.land_features.commercial +
            analysis.land_features.industrial;

        analysis.environmental_metrics = {
            green_space_ratio: Number(greenSpace.toFixed(2)),
            urban_density: Number(urbanSpace.toFixed(2)),
            natural_buffer_zones: Number(
                analysis.land_features.natural.toFixed(2)
            )
        };
    }

    return analysis;
}

function randomNormal(mean = 0, std = 1) {
    let u = 0;
    let v = 0;

    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();

    const z =
        Math.sqrt(-2.0 * Math.log(u)) *
        Math.cos(2.0 * Math.PI * v);

    return mean + z * std;
}

function getMarinePlasticData(lat, lon, radius, coastalDistance) {
    const developedHigh = { base: 15, std: 2 };
    const developedLow = { base: 8, std: 1.5 };
    const developingHigh = { base: 25, std: 3 };
    const developingLow = { base: 12, std: 2 };

    const regions = [
        { lat: 37.7749, lon: -122.4194, profile: developedHigh },
        { lat: 49.2827, lon: -123.1207, profile: developedLow },
        { lat: 25.7617, lon: -80.1918, profile: developedHigh },
        { lat: 51.9225, lon: 4.4792, profile: developedHigh },
        { lat: 41.3851, lon: 2.1734, profile: developedHigh },
        { lat: 43.2965, lon: 5.3698, profile: developedHigh },
        { lat: 35.6762, lon: 139.6503, profile: developedHigh },
        { lat: 1.3521, lon: 103.8198, profile: developedHigh },
        { lat: -33.8688, lon: 151.2093, profile: developedLow },
        { lat: 59.9139, lon: 10.7522, profile: developedLow },
        { lat: -37.8136, lon: 144.9631, profile: developedHigh },
        { lat: 53.5511, lon: 9.9937, profile: developedHigh },
        { lat: 35.1796, lon: 129.0756, profile: developedHigh },
        { lat: -36.8509, lon: 174.7645, profile: developedLow },

        { lat: 19.0760, lon: 72.8777, profile: developingHigh },
        { lat: 14.5995, lon: 120.9842, profile: developingHigh },
        { lat: -6.2088, lon: 106.8456, profile: developingHigh },
        { lat: 6.5244, lon: 3.3792, profile: developingHigh },
        { lat: 31.2001, lon: 29.9187, profile: developingHigh },
        { lat: 33.5731, lon: -7.5898, profile: developingLow },
        { lat: -22.9068, lon: -43.1729, profile: developingHigh },
        { lat: -12.0464, lon: -77.0428, profile: developingHigh },
        { lat: 24.8607, lon: 67.0011, profile: developingHigh },
        { lat: 10.8231, lon: 106.6297, profile: developingHigh },
        { lat: 13.0827, lon: 80.2707, profile: developingHigh },
        { lat: 14.7167, lon: -17.4677, profile: developingLow }
    ];

    let nearest = null;
    let minimumDistance = Infinity;

    for (const region of regions) {
        const distance = Math.sqrt(
            Math.pow(region.lat - lat, 2) +
            Math.pow(region.lon - lon, 2)
        );

        if (distance < minimumDistance) {
            minimumDistance = distance;
            nearest = region;
        }
    }

    const profile = nearest ? nearest.profile : developedLow;

    let distanceFactor = 1;

    if (coastalDistance >= 6 && coastalDistance <= 7) {
        distanceFactor = 1.2;
    } else if (coastalDistance > 7) {
        distanceFactor = 0.8;
    }

    const baseValue = profile.base * distanceFactor;

    const historical = Array.from(
        { length: 50 },
        () => Math.max(0, baseValue + randomNormal(0, profile.std))
    );

    let concentration;

    if (baseValue < 10) {
        concentration = "Low";
    } else if (baseValue < 20) {
        concentration = "Medium";
    } else {
        concentration = "High";
    }

    return {
        concentration,
        regional_average: {
            concentration: baseValue,
            trend: "Stable",
            historical
        },
        impact_assessment: {
            level: concentration,
            trend: "Stable",
            projected_change: baseValue > 15 ? -5 : 0
        }
    };
}

async function runAnalysis(lat, lon, radius, coastalDistance) {
    const landUseData = await getOverpassData(lat, lon, radius);
    const landAnalysis = analyzeLandUse(landUseData);
    const plasticData = getMarinePlasticData(
        lat,
        lon,
        radius,
        coastalDistance
    );

    const impactWeights = {
        residential: 2,
        commercial: 3,
        industrial: 5,
        recreational: -1,
        natural: -2,
        agricultural: 1,
        infrastructure: 4
    };

    let impactScore = 0;

    for (const [category, weight] of Object.entries(impactWeights)) {
        impactScore +=
            (landAnalysis.land_features[category] || 0) * weight;
    }

    const absoluteImpactScore =
        Number(Math.abs(impactScore).toFixed(2));

    const analysis = {
        impact_score: absoluteImpactScore,

        score_trend:
            impactScore > 50
                ? "High Impact"
                : impactScore > 0
                ? "Moderate Impact"
                : "Low Impact",

        land_features: landAnalysis.land_features,

        detailed_breakdown:
            landAnalysis.detailed_breakdown,

        environmental_metrics:
            landAnalysis.environmental_metrics,

        coastal_metrics: {
            beach_quality:
                landAnalysis.land_features.natural > 30
                    ? "Good"
                    : "Fair",

            water_quality:
                impactScore < 0
                    ? "Good"
                    : impactScore < 50
                    ? "Fair"
                    : "Poor",

            erosion_risk:
                landAnalysis.land_features.natural > 40
                    ? "Low"
                    : "Medium"
        },

        regional_averages: {
            ...landAnalysis.land_features,
            plastic_concentration:
                plasticData.regional_average.concentration
        },

        marine_health_index:
            Number(
                (100 - Math.abs(impactScore) / 2).toFixed(2)
            ),

        coastal_vulnerability:
            impactScore < 0
                ? "Low"
                : impactScore < 50
                ? "Medium"
                : "High",

        marine_biodiversity:
            impactScore < 0
                ? "High"
                : impactScore < 50
                ? "Medium"
                : "Low",

        plastic_concentration:
            plasticData.concentration,

        plastic_trend:
            plasticData.regional_average.trend,

        plastic_impact:
            plasticData.impact_assessment.level,

        plastic_historical:
            plasticData.regional_average.historical
    };

    return {
        land_use: landUseData,
        analysis
    };
}