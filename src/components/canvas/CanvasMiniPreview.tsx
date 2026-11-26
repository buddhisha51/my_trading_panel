import { tauriBridge } from '../../services/tauriBridge';
import { parseCanvasDocument } from '../../types/canvas';
import { computeFibLevels, computeOteFibLevels } from '../../utils/canvasGeometry';

interface CanvasMiniPreviewProps {
  canvasJson: string;
  size?: 'compact' | 'large';
}

/**
 * Lightweight SVG + img thumbnail renderer for saved Konva canvas documents in note rows
 * and larger playbook visual cards without mounting heavy Konva Stage instances.
 */
  export function CanvasMiniPreview({
    canvasJson,
    size = 'compact',
  }: CanvasMiniPreviewProps) {
    const doc = parseCanvasDocument(canvasJson);
    const w = Math.max(120, doc.width || 560);
    const h = Math.max(80, doc.height || 340);
    const bgSrc = tauriBridge.resolveAttachmentSrc(doc.backgroundAttachmentPath);

    const sizeClass =
      size === 'large'
        ? 'h-48 w-full rounded-md'
        : 'h-14 w-24 shrink-0 rounded';

    return (
      <div
        className={`relative overflow-hidden border border-emerald-500/40 bg-slate-900 ${sizeClass}`}
        title={`ICT Canvas (${doc.shapes.length} shapes)`}
      >
        {bgSrc &&
          (doc.backgroundRect ? null : (
            <img
              src={bgSrc}
              alt="Annotated chart canvas"
              className="absolute inset-0 h-full w-full object-cover opacity-85"
            />
          ))}
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMidYMid meet"
          className="relative h-full w-full"
        >
          {bgSrc && doc.backgroundRect && (
            <image
              href={bgSrc}
              x={doc.backgroundRect.x}
              y={doc.backgroundRect.y}
              width={doc.backgroundRect.width}
              height={doc.backgroundRect.height}
              preserveAspectRatio="none"
            />
          )}
          {doc.shapes.map((shape) => {
            switch (shape.type) {
              case 'image': {
                const imgSrc = tauriBridge.resolveAttachmentSrc(shape.attachmentPath);
                if (!imgSrc) return null;
                return (
                  <image
                    key={shape.id}
                    href={imgSrc}
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    preserveAspectRatio="none"
                  />
                );
              }
              case 'candle': {
                const cx = shape.x + shape.bodyWidth / 2;
                return (
                  <g key={shape.id}>
                    <line
                      x1={cx}
                      y1={shape.wickTopY}
                      x2={cx}
                      y2={shape.wickBottomY}
                      stroke={shape.color}
                      strokeWidth={Math.max(2, shape.strokeWidth)}
                    />
                    <rect
                      x={shape.x}
                      y={shape.bodyY}
                      width={shape.bodyWidth}
                      height={shape.bodyHeight}
                      fill={shape.color}
                      rx={1}
                    />
                  </g>
                );
              }
              case 'rect':
                return (
                  <rect
                    key={shape.id}
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill={shape.color}
                    fillOpacity={shape.fillOpacity || 0.16}
                    stroke={shape.color}
                    strokeWidth={Math.max(2, shape.strokeWidth)}
                  />
                );
              case 'zone_box':
                return (
                  <rect
                    key={shape.id}
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill={shape.color}
                    fillOpacity={shape.fillOpacity || 0.25}
                    stroke={shape.color}
                    strokeWidth={Math.max(2, shape.strokeWidth)}
                  />
                );
              case 'straight_line':
                return (
                  <line
                    key={shape.id}
                    x1={shape.x1}
                    y1={shape.y1}
                    x2={shape.x2}
                    y2={shape.y2}
                    stroke={shape.color}
                    strokeWidth={Math.max(2.5, shape.strokeWidth)}
                  />
                );
              case 'channel': {
                const polyPts = `${shape.x1},${shape.y1} ${shape.x2},${shape.y2} ${shape.x2},${shape.y2 + shape.offsetY} ${shape.x1},${shape.y1 + shape.offsetY}`;
                return (
                  <g key={shape.id}>
                    <polygon
                      points={polyPts}
                      fill={shape.color}
                      fillOpacity={shape.fillOpacity || 0.14}
                    />
                    <line
                      x1={shape.x1}
                      y1={shape.y1}
                      x2={shape.x2}
                      y2={shape.y2}
                      stroke={shape.color}
                      strokeWidth={Math.max(2, shape.strokeWidth)}
                    />
                    <line
                      x1={shape.x1}
                      y1={shape.y1 + shape.offsetY}
                      x2={shape.x2}
                      y2={shape.y2 + shape.offsetY}
                      stroke={shape.color}
                      strokeWidth={Math.max(2, shape.strokeWidth)}
                    />
                    <line
                      x1={shape.x1}
                      y1={shape.y1 + shape.offsetY / 2}
                      x2={shape.x2}
                      y2={shape.y2 + shape.offsetY / 2}
                      stroke={shape.color}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  </g>
                );
              }
              case 'liquidity_line':
                return (
                  <line
                    key={shape.id}
                    x1={shape.x1}
                    y1={shape.y1}
                    x2={shape.x2}
                    y2={shape.y2}
                    stroke={shape.color}
                    strokeWidth={Math.max(2.5, shape.strokeWidth)}
                    strokeDasharray="6 4"
                  />
                );
              case 'mss_arrow':
                return (
                  <g key={shape.id}>
                    <line
                      x1={shape.x1}
                      y1={shape.y1}
                      x2={shape.x2}
                      y2={shape.y2}
                      stroke={shape.color}
                      strokeWidth={Math.max(3, shape.strokeWidth)}
                    />
                    <text
                      x={shape.x2 >= shape.x1 ? shape.x2 + 4 : shape.x2 - 28}
                      y={shape.y2 + 4}
                      fill={shape.color}
                      fontSize={12}
                      fontWeight="bold"
                    >
                      {shape.label}
                    </text>
                  </g>
                );
              case 'fib_retracement': {
                const fib = computeFibLevels(shape.startY, shape.endY);
                return (
                  <g key={shape.id}>
                    <rect
                      x={shape.x}
                      y={fib.goldenTopY}
                      width={shape.width}
                      height={Math.max(4, fib.goldenBottomY - fib.goldenTopY)}
                      fill={shape.color}
                      fillOpacity={0.18}
                    />
                    {fib.levels.map((lvl) => (
                      <line
                        key={lvl.label}
                        x1={shape.x}
                        y1={lvl.y}
                        x2={shape.x + shape.width}
                        y2={lvl.y}
                        stroke={shape.color}
                        strokeWidth={lvl.isHighlight ? 2.5 : 1.5}
                      />
                    ))}
                  </g>
                );
              }
              case 'ote_fib': {
                const ote = computeOteFibLevels(shape.startY, shape.endY);
                return (
                  <g key={shape.id}>
                    <rect
                      x={shape.x}
                      y={ote.zoneTopY}
                      width={shape.width}
                      height={Math.max(4, ote.zoneBottomY - ote.zoneTopY)}
                      fill={shape.color}
                      fillOpacity={0.22}
                    />
                    {ote.levels.map((lvl) => (
                      <line
                        key={lvl.label}
                        x1={shape.x}
                        y1={lvl.y}
                        x2={shape.x + shape.width}
                        y2={lvl.y}
                        stroke={shape.color}
                        strokeWidth={lvl.isSweetSpot ? 3 : 2}
                      />
                    ))}
                  </g>
                );
              }
              case 'freehand': {
                const pts: string[] = [];
                for (let i = 0; i + 1 < shape.points.length; i += 2) {
                  pts.push(`${shape.points[i]},${shape.points[i + 1]}`);
                }
                if (pts.length < 2) return null;
                return (
                  <polyline
                    key={shape.id}
                    points={pts.join(' ')}
                    fill="none"
                    stroke={shape.color}
                    strokeWidth={Math.max(2.5, shape.strokeWidth)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }
              case 'text_note':
                return (
                  <text
                    key={shape.id}
                    x={shape.x}
                    y={shape.y + shape.fontSize}
                    fill={shape.color}
                    fontSize={Math.max(14, shape.fontSize)}
                  >
                    {shape.text}
                  </text>
                );
            }
          })}
        </svg>
        <span className="pointer-events-none absolute right-0.5 bottom-0.5 rounded bg-slate-950/85 px-1 text-[9px] font-medium text-emerald-300">
          Canvas
        </span>
      </div>
    );
  }
