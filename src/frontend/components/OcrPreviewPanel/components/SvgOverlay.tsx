import React, { useEffect, useMemo, useState } from "react";
import { useOcrLines, useOcrView, useOcrTranslation, useOcrActions } from "../OcrEditorContext.tsx";
import { fitTextInPolygon } from "../utils/polygonTextLayout.ts";
import { polygonTextColor } from "../../../config.ts";

const HANDLE_RADIUS = 5;

const SvgOverlay: React.FC = () => {
  const {
    lines,
    selectedLineIndex,
    selectedLineIndices,
    setSelectedLineIndex,
  } = useOcrLines();

  const {
    svgRef,
    naturalSize,
    showBoxes,
    showTranslation,
    polygonBgColor,
  } = useOcrView();

  const { translatedLines } = useOcrTranslation();

  const {
    getSvgPoint,
    setContextMenu,
    startPolygonMoveDrag,
    startPolygonPointDrag,
    openPolygonMenu,
  } = useOcrActions();

  // Build a map of lineIndex → translated text for O(1) lookup
  const translationMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const tl of translatedLines) {
      if (tl.translated.trim()) m.set(tl.lineIndex, tl.translated);
    }
    return m;
  }, [translatedLines]);

  // Defer expensive layout computation so it never blocks the paint after a page switch.
  // fitTextInPolygon does a binary search with text wrapping per iteration; on pages with
  // many/long translations this was causing visible stutter synchronously during useMemo.
  const [layoutMap, setLayoutMap] = useState(() => new Map<number, ReturnType<typeof fitTextInPolygon>>());
  useEffect(() => {
    if (!showTranslation) {
      setLayoutMap(new Map());
      return;
    }
    const m = new Map<number, ReturnType<typeof fitTextInPolygon>>();
    for (const line of lines) {
      const text = translationMap.get(line.lineIndex);
      if (text && line.polygon && line.polygon.length >= 3) {
        m.set(line.lineIndex, fitTextInPolygon(text, line.polygon, line.orientation === "vertical" ? "vertical" : "horizontal"));
      }
    }
    setLayoutMap(m);
  }, [showTranslation, lines, translationMap]);

  if (!naturalSize) return null;

  return (
  <svg
    ref={svgRef}
    viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
    preserveAspectRatio="xMidYMid meet"
    style={{
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      userSelect: "none",
    }}
    onContextMenu={(event) => {
      event.preventDefault();
      const point = getSvgPoint(event);
      if (!point) return;
      setContextMenu({
        mouseX: event.clientX,
        mouseY: event.clientY,
        lineIndex: -1,
        pointIndex: null,
        clickPoint: point,
        kind: "background",
      });
    }}
  >
    {/* Define clip paths for translation overlay */}
    {showTranslation && (
      <defs>
        {lines.map((line) => {
          const polygon = line.polygon;
          if (!polygon || polygon.length < 3) return null;
          if (!translationMap.has(line.lineIndex)) return null;
          return (
            <clipPath key={`clip-${line.lineIndex}`} id={`clip-${line.lineIndex}`}>
              <polygon points={polygon.map((p) => `${p[0]},${p[1]}`).join(" ")} />
            </clipPath>
          );
        })}
      </defs>
    )}

    {lines.map((line, lineIdx) => {
      const isSelected = selectedLineIndex === lineIdx || selectedLineIndices.has(lineIdx);
      const polygon = line.polygon;
      const layout = showTranslation ? layoutMap.get(line.lineIndex) : undefined;

      return (
        <g key={`line-${lineIdx}`}>
          {polygon && polygon.length >= 3 && (
            <>
              {showBoxes && (
                <polygon
                  points={polygon.map((p) => `${p[0]},${p[1]}`).join(" ")}
                  fill={isSelected ? "rgba(255,152,0,0.45)" : "rgba(255,152,0,0.25)"}
                  stroke={isSelected ? "rgba(255,152,0,0.95)" : "rgba(255,152,0,0.65)"}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  onMouseDown={(event) => {
                    if (event.button !== 0) return;
                    event.stopPropagation();
                    startPolygonMoveDrag(lineIdx, polygon, event);
                  }}
                  onContextMenu={(event) => openPolygonMenu(event, lineIdx, null)}
                  onClick={() => setSelectedLineIndex(lineIdx)}
                />
              )}

              {/* Translation text overlay */}
              {layout && (
                <g clipPath={`url(#clip-${line.lineIndex})`}>
                  {/* Semi-transparent background fill — always receives pointer events for drag/click */}
                  <polygon
                    points={polygon.map((p) => `${p[0]},${p[1]}`).join(" ")}
                    fill={polygonBgColor}
                    stroke={isSelected ? "rgba(255,152,0,0.95)" : "none"}
                    strokeWidth={isSelected ? 2.5 : 0}
                    onMouseDown={(event) => {
                      if (event.button !== 0) return;
                      event.stopPropagation();
                      startPolygonMoveDrag(lineIdx, polygon, event);
                    }}
                    onContextMenu={(event) => openPolygonMenu(event, lineIdx, null)}
                    onClick={() => setSelectedLineIndex(lineIdx)}
                  />
                  {layout.kind === "horizontal"
                    ? layout.lines.map((row, i) => (
                      <text
                        key={i}
                        x={layout.cx}
                        y={layout.startY + i * layout.lineHeight}
                        textAnchor="middle"
                        fontSize={layout.fontSize}
                        fill={polygonTextColor(polygonBgColor)}
                        fontFamily="sans-serif"
                        style={{ pointerEvents: "none" }}
                      >
                        {row}
                      </text>
                    ))
                    : layout.columns.map((col, ci) => {
                      const x = layout.startX - ci * layout.columnWidth;
                      return col.split("").map((ch, ri) => (
                        <text
                          key={`${ci}-${ri}`}
                          x={x}
                          y={layout.startY + ri * (layout.fontSize * 1.1)}
                          textAnchor="middle"
                          fontSize={layout.fontSize}
                          fill={polygonTextColor(polygonBgColor)}
                          fontFamily="sans-serif"
                          style={{ pointerEvents: "none" }}
                        >
                          {ch}
                        </text>
                      ));
                    })
                  }
                </g>
              )}

              {showBoxes && polygon.map((point, pointIdx) => (
                <circle
                  key={`poly-handle-${lineIdx}-${pointIdx}`}
                  cx={point[0]}
                  cy={point[1]}
                  r={HANDLE_RADIUS}
                  fill="#fff"
                  stroke="#ef6c00"
                  strokeWidth={2}
                  style={{ cursor: "move" }}
                  onMouseDown={(event) => {
                    if (event.button !== 0) return;
                    event.stopPropagation();
                    startPolygonPointDrag(lineIdx, pointIdx, event);
                  }}
                  onContextMenu={(event) => openPolygonMenu(event, lineIdx, pointIdx)}
                />
              ))}
            </>
          )}
        </g>
      );
    })}
  </svg>
  );
};

export default SvgOverlay;
