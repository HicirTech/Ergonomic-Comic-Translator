import React, { useCallback, useEffect, useState } from "react";
import type { OcrLineItem } from "../../../api/index.ts";
import type { DragState, EditorSnapshot } from "../types.ts";

export const usePolygonDrag = (
  svgRef: React.RefObject<SVGSVGElement | null>,
  dragStartSnapshotRef: React.MutableRefObject<EditorSnapshot | null>,
  snapshotCurrent: () => EditorSnapshot,
  commitDragHistory: () => void,
  setLines: (updater: (prev: OcrLineItem[]) => OcrLineItem[]) => void,
  setSelectedLineIndex: (index: number | ((prev: number | null) => number | null)) => void,
) => {
  const [dragState, setDragState] = useState<DragState | null>(null);

  const getSvgPoint = useCallback((event: MouseEvent | React.MouseEvent): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const transformed = point.matrixTransform(ctm.inverse());
    return [transformed.x, transformed.y];
  }, [svgRef]);

  const applyDragUpdate = useCallback((updater: (prev: OcrLineItem[]) => OcrLineItem[]) => {
    setLines(updater);
  }, [setLines]);

  const startPolygonMoveDrag = useCallback((lineIndex: number, polygon: [number, number][], event: React.MouseEvent) => {
    const start = getSvgPoint(event);
    if (!start) return;
    setSelectedLineIndex(lineIndex);
    dragStartSnapshotRef.current = snapshotCurrent();
    setDragState({
      kind: "polygon-move",
      lineIndex,
      startPointer: start,
      original: polygon,
    });
  }, [getSvgPoint, snapshotCurrent, dragStartSnapshotRef, setSelectedLineIndex]);

  const startPolygonPointDrag = useCallback((lineIndex: number, pointIndex: number, _event: React.MouseEvent) => {
    setSelectedLineIndex(lineIndex);
    dragStartSnapshotRef.current = snapshotCurrent();
    setDragState({
      kind: "polygon-point",
      lineIndex,
      pointIndex,
    });
  }, [snapshotCurrent, dragStartSnapshotRef, setSelectedLineIndex]);

  // RAF-throttled drag effect
  useEffect(() => {
    if (!dragState) return;

    let rafId: number | null = null;
    let queuedPointer: [number, number] | null = null;
    let lastMoveDx: number | null = null;
    let lastMoveDy: number | null = null;

    const flushMove = () => {
      rafId = null;
      const pointer = queuedPointer;
      if (!pointer) return;

      if (dragState.kind === "polygon-point") {
        applyDragUpdate((prev) => {
          const line = prev[dragState.lineIndex];
          if (!line?.polygon || !line.polygon[dragState.pointIndex]) return prev;
          const currentPoint = line.polygon[dragState.pointIndex];
          if (currentPoint[0] === pointer[0] && currentPoint[1] === pointer[1]) return prev;
          const next = [...prev];
          const polygon = [...line.polygon];
          polygon[dragState.pointIndex] = [pointer[0], pointer[1]];
          next[dragState.lineIndex] = { ...line, polygon };
          return next;
        });
        return;
      }

      if (dragState.kind === "polygon-move") {
        const dx = pointer[0] - dragState.startPointer[0];
        const dy = pointer[1] - dragState.startPointer[1];
        if ((dx === 0 && dy === 0) || (lastMoveDx === dx && lastMoveDy === dy)) return;
        lastMoveDx = dx;
        lastMoveDy = dy;
        applyDragUpdate((prev) => {
          const line = prev[dragState.lineIndex];
          if (!line) return prev;
          const next = [...prev];
          next[dragState.lineIndex] = {
            ...line,
            polygon: dragState.original.map((p) => [p[0] + dx, p[1] + dy] as [number, number]),
          };
          return next;
        });
      }
    };

    const onMove = (event: MouseEvent) => {
      const pointer = getSvgPoint(event);
      if (!pointer) return;
      queuedPointer = pointer;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(flushMove);
    };

    const onUp = () => {
      commitDragHistory();
      setDragState(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState, applyDragUpdate, commitDragHistory, getSvgPoint]);

  return {
    dragState,
    getSvgPoint,
    startPolygonMoveDrag,
    startPolygonPointDrag,
  };
};
