import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { tagumCityGeoJSON } from '../../data/tagumCityGeoJSON';
import './ChoroplethMap.css';

function ChoroplethMap({ barangayData }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const geoJsonLayerRef = useRef(null);

    useEffect(() => {
        // Initialize map only once
        if (!mapInstance.current) {
            // Create map centered on Tagum City with strict zoom constraints
            mapInstance.current = L.map(mapRef.current, {
                minZoom: 11,
                maxZoom: 14,
                zoomControl: true,
                dragging: true,
                scrollWheelZoom: true,
                doubleClickZoom: false,
                boxZoom: false
            }).setView([8, 125.835], 12);

            // Add minimal/reduced map theme with some details
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                minZoom: 11,
                maxZoom: 14,
                subdomains: 'abcd'
            }).addTo(mapInstance.current);
        }

        // Case data mapping - merge with barangayData from Charts component
        const caseDataMap = {};
        barangayData.forEach(barangay => {
            const shareValue = parseFloat(barangay.share.replace('%', ''));
            caseDataMap[barangay.name] = {
                share: barangay.share,
                shareValue: shareValue
            };
        });

        // Enrich GeoJSON with case data
        const enrichedGeoJSON = {
            ...tagumCityGeoJSON,
            features: tagumCityGeoJSON.features.map(feature => {
                const barangayName = feature.properties.ADM4_EN;
                const caseData = caseDataMap[barangayName] || { share: '---', shareValue: 0 };
                
                return {
                    ...feature,
                    properties: {
                        ...feature.properties,
                        name: barangayName,
                        share: caseData.share,
                        shareValue: caseData.shareValue
                    }
                };
            })
        };

        // Function to get color based on share percentage
        const getColor = (shareValue) => {
            // No data / zero
            if (!shareValue || shareValue === 0) return '#CAF0F8';

            // Distinct shades for ranges:
            // 0-10 : very light (pale cream)
            // 10-20: light peach
            // 20-30: warm orange
            // 30-40: deep red-orange
            // 40+  : dark maroon
            if (shareValue >= 40) return '#03045E'; // midnight zone
            if (shareValue >= 30) return '#0077b6'; // twilight zone
            if (shareValue >= 20) return '#00b4d8'; // glacier blue
            if (shareValue >= 10) return '#90e0ef'; // pale sky blue 
            return '#FFF3D6'; // very light cream for lowest non-zero bucket
        };

        // Style function for each feature
        const style = (feature) => {
            return {
                fillColor: getColor(feature.properties.shareValue),
                weight: 1,
                opacity: 1,
                color: '#226b85',
                dashArray: '',
                fillOpacity: 0.7
            };
        };

        // Highlight feature on hover
        const highlightFeature = (e) => {
            const layer = e.target;
            layer.setStyle({
                weight: 5,
                color: '#666',
                dashArray: '',
                fillOpacity: 0.9
            });
            layer.bringToFront();
        };

        // Reset highlight on mouseout
        const resetHighlight = (e) => {
            geoJsonLayerRef.current.resetStyle(e.target);
        };

        // Show popup on click
        const onEachFeature = (feature, layer) => {
            layer.on({
                mouseover: highlightFeature,
                mouseout: resetHighlight,
                click: (e) => {
                    const props = feature.properties;
                    const popupContent = `
                        <div style="font-family: Arial, sans-serif;">
                            <h3 style="margin: 0 0 10px 0; color: #226b85;">${props.name}</h3>
                            <p style="margin: 5px 0;"><strong>Share:</strong> ${props.share}</p>
                        </div>
                    `;
                    layer.bindPopup(popupContent).openPopup();
                }
            });

            // Add tooltip on hover
            layer.bindTooltip(feature.properties.name, {
                permanent: false,
                direction: 'center',
                className: 'barangay-tooltip'
            });
        };

        // Remove old GeoJSON layer if exists
        if (geoJsonLayerRef.current) {
            mapInstance.current.removeLayer(geoJsonLayerRef.current);
        }

        // Add GeoJSON layer with enriched data
        geoJsonLayerRef.current = L.geoJSON(enrichedGeoJSON, {
            style: style,
            onEachFeature: onEachFeature
        }).addTo(mapInstance.current);

        // Get bounds and lock map to Tagum City boundaries
        const bounds = geoJsonLayerRef.current.getBounds();
        
        // Fit map to bounds
        mapInstance.current.fitBounds(bounds, { padding: [20, 20] });
        
        // Set max bounds with padding to lock the map - prevent panning outside
        const maxBounds = bounds.pad(0.15);
        mapInstance.current.setMaxBounds(maxBounds);

        // Add legend (only add if not already present)
        if (!mapInstance.current._legend) {
            const legend = L.control({ position: 'bottomright' });
            legend.onAdd = function (map) {
                const div = L.DomUtil.create('div', 'info legend');
                const grades = [0, 10, 20, 30, 40];
                const labels = [];

                div.innerHTML = '<h4>Cases</h4>';
                
                for (let i = 0; i < grades.length; i++) {
                    div.innerHTML +=
                        '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
                        grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
                }

                // Ensure 'No Data' sits on its own line rather than inline with the last grade
                div.innerHTML += '<br><i style="background:#e0e0e0"></i> No Data';
                
                return div;
            };
            legend.addTo(mapInstance.current);
            mapInstance.current._legend = true;
        }

        // Cleanup function
        return () => {
            // Don't destroy map on every render, only on component unmount
        };
    }, [barangayData]);

    return (
        <div 
            ref={mapRef} 
            style={{ 
                height: '100%', 
                width: '100%',
                minHeight: '400px',
                borderRadius: '8px'
            }}
        />
    );
}

export default ChoroplethMap;