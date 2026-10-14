import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RailRadarRouteGeometry } from '../../types';
import { ProvenanceBadge } from './ProvenanceBadge';

interface RouteMapProps {
  geometry: RailRadarRouteGeometry | null;
  currentStationCode?: string | null;
  currentStationName?: string | null;
  segmentProgress?: number | null;
  speedKmph?: number | null;
  loading?: boolean;
}

export const RouteMap: React.FC<RouteMapProps> = ({
  geometry,
  currentStationCode,
  currentStationName,
  segmentProgress,
  speedKmph,
  loading = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Leaflet Map once (StrictMode-safe)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Clear any leftover Leaflet DOM from previous instances
    const container = mapContainerRef.current;
    container.innerHTML = '';

    const map = L.map(container, {
      center: [23.5, 80.0], // Center on India
      zoom: 5,
      zoomControl: true,
      attributionControl: false,
    });

    // CartoDB Positron / OSM tiles for crisp modern look
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Attribution
    L.control
      .attribution({ position: 'bottomright' })
      .addAttribution('&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap')
      .addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    // Ensure correct sizing after mount (handles StrictMode double-init)
    const sizeTimer = setTimeout(() => map.invalidateSize(), 0);

    return () => {
      clearTimeout(sizeTimer);
      // Only remove if this effect's map is still the active instance
      if (mapInstanceRef.current === map) {
        map.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  // Update GeoJSON track geometry & Station markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (!geometry || !geometry.geojson) {
      return;
    }

    try {
      // 1. Plot Railway Track Polyline using GeoJSON (GeoJSON coordinates are [lng, lat])
      const geoJsonLayer = L.geoJSON(geometry.geojson as any, {
        style: {
          color: '#002B49', // RailFlow primary navy
          weight: 4,
          opacity: 0.85,
          lineJoin: 'round',
        },
      });
      geoJsonLayer.addTo(layerGroup);

      // Accent dash overlay for railway line feel
      const dashTrackLayer = L.geoJSON(geometry.geojson as any, {
        style: {
          color: '#E5A823', // RailFlow gold accent
          weight: 2,
          dashArray: '8, 8',
          opacity: 0.9,
        },
      });
      dashTrackLayer.addTo(layerGroup);

      // 2. Plot Stops & Mark Current Station Block
      const bounds = geoJsonLayer.getBounds();

      if (Array.isArray(geometry.stops) && geometry.stops.length > 0) {
        geometry.stops.forEach((stop, index) => {
          if (typeof stop.lat !== 'number' || typeof stop.lng !== 'number') return;

          const isOrigin = index === 0;
          const isTerminus = index === geometry.stops.length - 1;
          const isCurrentBlock =
            currentStationCode &&
            stop.code.toUpperCase() === currentStationCode.toUpperCase();

          // Marker styling
          const markerRadius = isCurrentBlock ? 8 : isOrigin || isTerminus ? 6 : 4;
          const markerColor = isCurrentBlock
            ? '#2E7D32' // green confirmed
            : isOrigin
            ? '#002B49'
            : isTerminus
            ? '#C62828'
            : '#5B6F82';

          const circleMarker = L.circleMarker([stop.lat, stop.lng], {
            radius: markerRadius,
            fillColor: markerColor,
            fillOpacity: 1,
            color: '#FFFFFF',
            weight: isCurrentBlock ? 3 : 2,
          });

          // Popup
          const popupContent = `
            <div style="font-family: inherit; font-size: 12px; line-height: 1.4; color: #1C1B1F;">
              <div style="font-weight: 700; font-size: 13px; color: #002B49;">${stop.name} (${stop.code})</div>
              <div style="color: #49454F; font-size: 11px;">Stop Sequence: #${stop.sequence}</div>
              ${
                isCurrentBlock
                  ? `<div style="margin-top: 4px; padding: 2px 6px; background: #E8F5E9; color: #2E7D32; border-radius: 4px; font-weight: 700; font-size: 10px;">
                      LAST CLEARED BLOCK
                    </div>`
                  : ''
              }
            </div>
          `;
          circleMarker.bindPopup(popupContent);
          circleMarker.addTo(layerGroup);
        });
      }

      // Fit map view to the railway track geometry bounds
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    } catch (err) {
      console.warn('Failed to render route geometry on map:', err);
    }
  }, [geometry, currentStationCode]);

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-outline-variant/30 bg-surface-container-low shadow-sm">
      {/* Map Header Status Bar */}
      <div className="px-5 py-3.5 bg-surface-container-lowest border-b border-outline-variant/20 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[18px]">polyline</span>
          <span className="font-bold text-on-surface">Physical Railway Route Track</span>
          {geometry && (
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[10px]">
              {geometry.stops.length} GeoJSON Stations
            </span>
          )}
        </div>

        {/* Current Block Indicator */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          {currentStationName ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-status-confirmed/10 text-status-confirmed font-bold">
              <span className="w-2 h-2 rounded-full bg-status-confirmed animate-pulse"></span>
              <span>Block: {currentStationName}</span>
              {segmentProgress !== null && segmentProgress !== undefined && (
                <span className="text-on-surface-variant font-normal">
                  ({Math.round(segmentProgress * 100)}% segment)
                </span>
              )}
            </div>
          ) : (
            <span className="text-on-surface-variant">Track Geometry View</span>
          )}

          {speedKmph !== null && speedKmph !== undefined && speedKmph > 0 && (
            <span className="px-2 py-1 rounded-xl bg-surface-container-high text-on-surface font-semibold">
              {Math.round(speedKmph)} km/h
            </span>
          )}
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative h-80 sm:h-96 w-full">
        {loading && (
          <div className="absolute inset-0 z-10 bg-surface/80 backdrop-blur-xs flex items-center justify-center gap-2 text-xs font-bold text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
            <span>Loading Track Geometry...</span>
          </div>
        )}

        {!loading && !geometry && (
          <div className="absolute inset-0 z-10 bg-surface-container-low flex flex-col items-center justify-center gap-2 text-xs text-on-surface-variant p-6 text-center">
            <span className="material-symbols-outlined text-3xl text-outline">map</span>
            <span className="font-bold text-sm text-on-surface">Route Geometry Not Available</span>
            <span className="max-w-xs text-[11px]">
              No GeoJSON track geometry provided for this train. Inspect the sequential station progression table below.
            </span>
          </div>
        )}

        <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 1 }} />
      </div>

      {/* Transparent Map Footer Disclosure */}
      <div className="px-4 py-2 bg-surface-container-lowest/90 border-t border-outline-variant/20 flex flex-wrap items-center justify-between text-[11px] text-on-surface-variant">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[15px] text-outline">info</span>
          <span>
            Route polyline is static geometry from the active source. Marker is last reported station block, not satellite GPS.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ProvenanceBadge
            source={geometry?.meta.source}
            label={geometry?.meta.provenanceLabel}
          />
          <span className="font-mono text-[10px]">{geometry?.meta.source || 'Unavailable'}</span>
        </div>
      </div>
    </div>
  );
};
