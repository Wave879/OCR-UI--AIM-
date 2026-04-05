import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// Load pdf.js from CDN (no npm needed)
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

let pdfjsLib = null;

async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;
    const mod = await import(/* @vite-ignore */ PDFJS_CDN);
    mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    pdfjsLib = mod;
    return pdfjsLib;
}

// ── Single page canvas renderer ──────────────────────────────
function PdfPage({ pdfDoc, pageNum, scale, isActive }) {
    const canvasRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const renderTaskRef = useRef(null);

    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return;
        let cancelled = false;

        const render = async () => {
            setLoading(true);
            try {
                const page = await pdfDoc.getPage(pageNum);
                if (cancelled) return;

                const viewport = page.getViewport({ scale });
                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                // Cancel any previous render task
                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                }

                const task = page.render({ canvasContext: ctx, viewport });
                renderTaskRef.current = task;
                await task.promise;
                if (!cancelled) setLoading(false);
            } catch (e) {
                if (e?.name !== 'RenderingCancelledException' && !cancelled) {
                    setLoading(false);
                }
            }
        };

        render();
        return () => {
            cancelled = true;
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [pdfDoc, pageNum, scale]);

    return (
        <div
            className={`relative bg-white rounded-xl overflow-hidden transition-all duration-200
        ${isActive
                    ? 'shadow-[0_8px_40px_rgba(0,32,96,0.18)] ring-2 ring-[#002060]/20'
                    : 'shadow-[0_4px_20px_rgba(0,0,0,0.12)]'}`}
        >
            {loading && (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10"
                    style={{ minWidth: 400, minHeight: 560 }}
                >
                    <Loader2 size={28} className="text-[#002060]/40 animate-spin" />
                </div>
            )}
            <canvas
                ref={canvasRef}
                className="block w-full"
                style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.3s' }}
            />
        </div>
    );
}

// ── Thumbnail ─────────────────────────────────────────────────
function PdfThumb({ pdfDoc, pageNum, isActive, onClick }) {
    const canvasRef = useRef(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return;
        let cancelled = false;
        (async () => {
            try {
                const page = await pdfDoc.getPage(pageNum);
                if (cancelled) return;
                const viewport = page.getViewport({ scale: 0.22 });
                const canvas = canvasRef.current;
                if (!canvas) return;
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                if (!cancelled) setReady(true);
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [pdfDoc, pageNum]);

    return (
        <button
            onClick={onClick}
            className={`w-full flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all duration-150 group
        ${isActive
                    ? 'bg-[#002060]/10'
                    : 'hover:bg-slate-100'}`}
        >
            <div className={`w-full overflow-hidden rounded-md border-2 transition-all
        ${isActive ? 'border-[#002060]' : 'border-transparent group-hover:border-slate-300'}`}>
                <canvas
                    ref={canvasRef}
                    className="w-full block"
                    style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.2s', background: '#f8fafc' }}
                />
                {!ready && <div className="w-full" style={{ paddingBottom: '141%', background: '#f3f4f6' }} />}
            </div>
            <span className={`text-[10px] font-bold tabular-nums ${isActive ? 'text-[#002060]' : 'text-slate-400'}`}>
                {pageNum}
            </span>
        </button>
    );
}

// ── Main PdfViewer ────────────────────────────────────────────
export default function PdfViewer({ file, zoom }) {
    const [pdfDoc, setPdfDoc] = useState(null);
    const [numPages, setNumPages] = useState(0);
    const [curPage, setCurPage] = useState(1);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const scale = ((zoom || 100) / 100) * 1.6; // base scale 1.6 for crisp rendering

    useEffect(() => {
        if (!file?.raw) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setPdfDoc(null);
        setCurPage(1);

        (async () => {
            try {
                const lib = await loadPdfJs();
                const arrayBuffer = await file.raw.arrayBuffer();
                if (cancelled) return;
                const doc = await lib.getDocument({ data: arrayBuffer }).promise;
                if (cancelled) return;
                setPdfDoc(doc);
                setNumPages(doc.numPages);
                setLoading(false);
            } catch (e) {
                if (!cancelled) { setError(e.message || 'Failed to load PDF'); setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
    }, [file]);

    const goTo = useCallback((n) => {
        setCurPage(Math.max(1, Math.min(numPages, n)));
    }, [numPages]);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-[3px] border-slate-200" />
                    <div className="w-16 h-16 rounded-full border-[3px] border-[#002060] border-t-transparent animate-spin absolute inset-0" />
                </div>
                <p className="text-sm text-slate-500 font-medium">กำลังโหลด PDF…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <p className="text-red-500 text-sm">ไม่สามารถโหลด PDF: {error}</p>
            </div>
        );
    }

    if (!pdfDoc) return null;

    return (
        <div className="flex flex-1 overflow-hidden h-full">
            {/* ── Thumbnail strip ── */}
            <div className="w-[110px] flex-shrink-0 overflow-y-auto bg-[#f1f3f8] border-r border-slate-200 py-3 px-2 space-y-1 scrollbar-thin">
                {Array.from({ length: numPages }, (_, i) => i + 1).map(n => (
                    <PdfThumb
                        key={n}
                        pdfDoc={pdfDoc}
                        pageNum={n}
                        isActive={curPage === n}
                        onClick={() => goTo(n)}
                    />
                ))}
            </div>

            {/* ── Main page view ── */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Page nav bar */}
                <div className="h-11 bg-white border-b border-slate-200 flex items-center justify-center gap-3 flex-shrink-0 shadow-sm">
                    <button
                        onClick={() => goTo(curPage - 1)}
                        disabled={curPage <= 1}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                        <span>หน้า</span>
                        <input
                            type="number"
                            min={1}
                            max={numPages}
                            value={curPage}
                            onChange={e => goTo(Number(e.target.value))}
                            className="w-12 text-center border border-slate-200 rounded-md px-1 py-0.5 text-sm font-bold text-[#002060] outline-none focus:border-[#002060] focus:ring-1 focus:ring-[#002060]/20"
                        />
                        <span className="text-slate-400">/ {numPages}</span>
                    </div>
                    <button
                        onClick={() => goTo(curPage + 1)}
                        disabled={curPage >= numPages}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Page canvas */}
                <div className="flex-1 overflow-auto bg-slate-200/60 flex flex-col items-center py-8 px-6 gap-8"
                    style={{ backgroundImage: 'radial-gradient(circle,#94a3b8 1px,transparent 1px)', backgroundSize: '24px 24px' }}
                >
                    {/* Show current page */}
                    <PdfPage
                        pdfDoc={pdfDoc}
                        pageNum={curPage}
                        scale={scale}
                        isActive
                    />

                    {/* Page indicator pill */}
                    <div className="sticky bottom-4 bg-[#002060]/80 backdrop-blur-sm text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                        {curPage} / {numPages}
                    </div>
                </div>
            </div>
        </div>
    );
}
