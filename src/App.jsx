import { useState, useRef, useCallback, useEffect } from 'react';
import PdfViewer from './PdfViewer.jsx';
import {
    LayoutDashboard, Cpu, History, Settings, ChevronLeft, ChevronRight,
    Plus, Play, ZoomIn, ZoomOut, RotateCw, Trash2, Upload, FileText,
    ChevronDown, ChevronUp, Copy, Download, Check, X, Loader2,
    AlertCircle, Eye, EyeOff, ScanLine, Layers, Code2, ListTree,
    Braces, BarChart2, BookOpen, Shield, Users, Calendar, Tag,
    MousePointerClick, Sparkles
} from 'lucide-react';

// ─── Azure Config ───────────────────────────────────────────
const AZURE_ENDPOINT = 'https://doc-titiphon.cognitiveservices.azure.com/';
const AZURE_KEY = '9EKbZPTPbyPoo7XzCMzf5lkXdEs558KH3k74nhZ90mgVkm72w1wWJQQJ99CAACqBBLyXJ3w3AAALACOGnh9F';
const API_VERSION = '2024-11-30';
const DEFAULT_MODEL = 'prebuilt-contract';

const MODELS = [
    { id: 'prebuilt-contract', label: 'Contract', icon: Shield },
    { id: 'prebuilt-invoice', label: 'Invoice', icon: FileText },
    { id: 'prebuilt-receipt', label: 'Receipt', icon: Tag },
    { id: 'prebuilt-idDocument', label: 'ID Document', icon: Users },
    { id: 'prebuilt-layout', label: 'Layout', icon: Layers },
    { id: 'prebuilt-read', label: 'Read', icon: BookOpen },
    { id: 'prebuilt-document', label: 'Document', icon: FileText },
];



// ─── Confidence colors ───────────────────────────────────────
function confColor(c) {
    if (c == null) return { bar: 'bg-slate-300', text: 'text-slate-400', label: '—' };
    if (c >= 0.85) return { bar: 'bg-emerald-500', text: 'text-emerald-600', label: `${(c * 100).toFixed(1)}%` };
    if (c >= 0.6) return { bar: 'bg-orange-400', text: 'text-orange-500', label: `${(c * 100).toFixed(1)}%` };
    return { bar: 'bg-red-400', text: 'text-red-500', label: `${(c * 100).toFixed(1)}%` };
}

// ─── Extract field value as string ──────────────────────────
function fieldStr(fv) {
    if (!fv) return '—';
    const map = {
        string: () => fv.valueString,
        date: () => fv.valueDate,
        time: () => fv.valueTime,
        integer: () => fv.valueInteger != null ? String(fv.valueInteger) : null,
        number: () => fv.valueNumber != null ? String(fv.valueNumber) : null,
        boolean: () => fv.valueBoolean != null ? (fv.valueBoolean ? 'Yes' : 'No') : null,
        currency: () => fv.valueCurrency ? `${fv.valueCurrency.amount ?? ''} ${fv.valueCurrency.currencyCode ?? ''}`.trim() : null,
        address: () => fv.valueAddress?.streetAddress ?? null,
        phoneNumber: () => fv.valuePhoneNumber ?? null,
        countryRegion: () => fv.valueCountryRegion ?? null,
        selectionMark: () => fv.valueSelectionMark ?? null,
    };
    const fn = map[fv.type];
    return (fn ? fn() : null) ?? fv.content ?? '—';
}



// ─── Syntax highlight JSON ───────────────────────────────────
function JsonHighlight({ json }) {
    const html = json
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
            (m) => {
                let cls = 'text-red-300';
                if (/^"/.test(m)) cls = /:$/.test(m) ? 'text-sky-300' : 'text-emerald-300';
                else if (/true|false/.test(m)) cls = 'text-pink-300';
                else if (/null/.test(m)) cls = 'text-slate-400';
                return `<span class="${cls}">${m}</span>`;
            });
    return (
        <pre
            className="text-xs font-mono leading-relaxed p-4 overflow-auto h-full text-slate-200"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

// ─── Python code generator ───────────────────────────────────
function generatePython(model) {
    return `from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential

endpoint = "${AZURE_ENDPOINT}"
key      = "${AZURE_KEY}"

client = DocumentIntelligenceClient(
    endpoint   = endpoint,
    credential = AzureKeyCredential(key)
)

# Analyze from local file
with open("document.pdf", "rb") as f:
    poller = client.begin_analyze_document(
        model_id = "${model}",
        body     = f,
    )
result = poller.result()

# Extract fields
for doc in result.documents:
    print(f"DocType: {doc.doc_type}")
    for name, field in doc.fields.items():
        print(f"  {name}: {field.content} (conf: {field.confidence:.2%})")

# Full content
print("\\n--- Extracted Text ---")
print(result.content)
`;
}


// ─── Reference-style Field Row ───────────────────────────────
const FIELD_COLORS = [
    '#3b82f6', '#10b981', '#f97316', '#8b5cf6',
    '#ef4444', '#14b8a6', '#f59e0b', '#6366f1', '#ec4899'
];
function fieldColor(i) { return FIELD_COLORS[i % FIELD_COLORS.length]; }

// Render object sub-items (Clause: …, Region: …)
function ObjectSubItems({ obj }) {
    if (!obj || typeof obj !== 'object') return null;
    const entries = Object.entries(obj);
    if (!entries.length) return null;
    return (
        <div className="pl-5 pb-3 space-y-2">
            {entries.map(([k, v]) => (
                <div key={k}>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{k}</p>
                    <p className="text-sm text-slate-800 font-medium leading-snug">{fieldStr(v)}</p>
                </div>
            ))}
        </div>
    );
}

// Generic field row — matches reference layout exactly
function FieldRow({ name, fv, index, isActive, onClick }) {
    const [open, setOpen] = useState(true);
    const color = fieldColor(index);
    const conf = fv?.confidence;
    const confPct = conf != null ? `${(conf * 100).toFixed(2)}%` : null;
    const isArray = fv?.type === 'array';
    const isObject = fv?.type === 'object';
    const items = isArray ? (fv.valueArray || []) : [];
    const rawObj = isObject ? (fv.valueObject || {}) : null;
    const value = (!isArray && !isObject) ? fieldStr(fv) : null;

    return (
        <div
            className={`border-b border-slate-100 transition-colors
                ${isActive ? 'bg-blue-50' : 'hover:bg-slate-50 cursor-pointer'}`}
        >
            {/* Header row */}
            <div
                className="flex items-center gap-2.5 px-4 py-2.5"
                onClick={() => { onClick(name); setOpen(o => !o); }}
            >
                {/* Dot */}
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                {/* Name */}
                <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{name}</span>
                {/* Array count badge */}
                {isArray && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                        {items.length}
                    </span>
                )}
                {/* #1 page badge */}
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">#1</span>
                {/* Confidence %  */}
                {confPct && (
                    <span className={`text-xs font-bold tabular-nums ml-1 flex-shrink-0 ${conf >= 0.85 ? 'text-emerald-600' :
                        conf >= 0.6 ? 'text-orange-500' : 'text-red-500'
                        }`}>{confPct}</span>
                )}
                {/* Chevron */}
                <span className="text-slate-400 flex-shrink-0">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
            </div>

            {/* Expanded body */}
            {open && (
                <div onClick={e => e.stopPropagation()}>
                    {/* Simple value */}
                    {value && value !== '—' && (
                        <p className="px-5 pb-3 text-sm text-slate-800 font-semibold leading-snug">{value}</p>
                    )}
                    {/* Object sub-items */}
                    {rawObj && <ObjectSubItems obj={rawObj} />}
                    {/* Array items */}
                    {isArray && items.map((item, i) => (
                        <div key={i} className="pl-5 pr-4 pb-2">
                            {item.type === 'object' ? (
                                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                                    {Object.entries(item.valueObject || {}).map(([k, v]) => (
                                        <div key={k} className="flex gap-2 py-0.5">
                                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide w-24 flex-shrink-0">{k}</span>
                                            <span className="text-xs text-slate-700">{fieldStr(v)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-700">
                                    <span className="text-slate-400 mr-1">{i + 1}.</span>{fieldStr(item)}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


// ─── Bounding Box Overlay ─────────────────────────────────────
function BoundingBoxOverlay({ highlights, imgW, imgH, renderW, renderH, activeField }) {
    if (!highlights.length || !renderW || !renderH) return null;
    const sx = renderW / (imgW || renderW);
    const sy = renderH / (imgH || renderH);

    return (
        <svg
            className="absolute inset-0 pointer-events-none"
            width={renderW} height={renderH}
            viewBox={`0 0 ${renderW} ${renderH}`}
        >
            {highlights.map(({ name, poly, color, bgColor }, i) => {
                if (!poly || poly.length < 4) return null;
                const pts = [];
                for (let j = 0; j < poly.length - 1; j += 2) {
                    pts.push([poly[j] * sx, poly[j + 1] * sy]);
                }
                const d = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + 'Z';
                const isActive = activeField === name;
                return (
                    <path
                        key={i}
                        d={d}
                        fill={bgColor}
                        stroke={color}
                        strokeWidth={isActive ? 2.5 : 1.5}
                        opacity={isActive ? 1 : 0.7}
                    />
                );
            })}
        </svg>
    );
}

// ─── Toast ────────────────────────────────────────────────────
function useToast() {
    const [toast, setToast] = useState(null);
    const show = useCallback((msg, type = 'info') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);
    return { toast, show };
}

// ─── MAIN APP ─────────────────────────────────────────────────
export default function App() {
    // Layout state
    const [panelOpen, setPanelOpen] = useState(true);
    const [activeTab, setActiveTab] = useState('content');

    // File / analysis state
    const [file, setFile] = useState(null);      // { name, src, type }
    const [model, setModel] = useState(DEFAULT_MODEL);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeStatus, setAnalyzeStatus] = useState('');
    const [result, setResult] = useState(null);
    const [activeField, setActiveField] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [copied, setCopied] = useState(false);

    // Zoom / rotate
    const [zoom, setZoom] = useState(100);
    const [rotate, setRotate] = useState(0);

    // Image dimensions for overlay
    const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
    const [renderDims, setRenderDims] = useState({ w: 0, h: 0 });

    const fileInputRef = useRef();
    const imgRef = useRef();
    const imgContainerRef = useRef();

    const { toast, show: showToast } = useToast();

    // ── Highlights from result ─────────────────────────────────
    const highlights = useCallback(() => {
        if (!result) return [];
        const hl = [];
        const colors = [
            ['rgba(59,130,246,0.8)', 'rgba(59,130,246,0.08)'],
            ['rgba(16,185,129,0.8)', 'rgba(16,185,129,0.08)'],
            ['rgba(255,140,0,0.8)', 'rgba(255,140,0,0.08)'],
            ['rgba(139,92,246,0.8)', 'rgba(139,92,246,0.08)'],
            ['rgba(239,68,68,0.8)', 'rgba(239,68,68,0.08)'],
            ['rgba(20,184,166,0.8)', 'rgba(20,184,166,0.08)'],
        ];
        let ci = 0;
        (result.documents || []).forEach(doc => {
            Object.entries(doc.fields || {}).forEach(([name, fv]) => {
                const [color, bgColor] = colors[ci++ % colors.length];
                (fv?.boundingRegions || []).forEach(br => {
                    if (br.polygon) hl.push({ name, poly: br.polygon, color, bgColor });
                });
            });
        });
        return hl;
    }, [result]);

    // ── Update render dims on resize ──────────────────────────
    useEffect(() => {
        if (!imgRef.current) return;
        const obs = new ResizeObserver(() => {
            if (imgRef.current) {
                setRenderDims({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight });
            }
        });
        obs.observe(imgRef.current);
        return () => obs.disconnect();
    }, [file]);

    // ── File handling ─────────────────────────────────────────
    const handleFile = useCallback((f) => {
        if (!f) return;
        const allowed = ['image/png', 'image/jpeg', 'image/bmp', 'image/tiff', 'application/pdf'];
        if (!allowed.some(t => f.type.startsWith(t.split('/')[0])) && !f.name.match(/\.(pdf|png|jpg|jpeg|bmp|tiff)$/i)) {
            showToast('File type not supported', 'error'); return;
        }
        if (f.type === 'application/pdf' || f.name.endsWith('.pdf')) {
            setFile({ name: f.name, src: null, type: 'pdf', raw: f });
        } else {
            const reader = new FileReader();
            reader.onload = e => setFile({ name: f.name, src: e.target.result, type: 'image', raw: f });
            reader.readAsDataURL(f);
        }
        setResult(null); setActiveField(null); setZoom(100); setRotate(0);
    }, [showToast]);

    const onDrop = useCallback((e) => {
        e.preventDefault(); setIsDragging(false);
        handleFile(e.dataTransfer.files[0]);
    }, [handleFile]);

    // ── Run Analysis ──────────────────────────────────────────
    const runAnalysis = useCallback(async () => {
        if (!file || isAnalyzing) return;
        setIsAnalyzing(true); setActiveTab('fields');
        try {
            setAnalyzeStatus('Submitting document to Azure AI…');
            const apiUrl = `${AZURE_ENDPOINT}documentintelligence/documentModels/${model}:analyze?api-version=${API_VERSION}`;
            let resp;
            if (file.type === 'pdf') {
                resp = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY, 'Content-Type': 'application/pdf' },
                    body: file.raw
                });
            } else {
                resp = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY, 'Content-Type': 'application/octet-stream' },
                    body: file.raw
                });
            }
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error?.message || `HTTP ${resp.status}`);
            }
            const opUrl = resp.headers.get('Operation-Location') || resp.headers.get('operation-location');
            if (!opUrl) throw new Error('No Operation-Location header');

            // Poll — 600ms interval for fast results
            for (let i = 0; i < 80; i++) {
                setAnalyzeStatus(`Processing… (${i + 1})`);
                await new Promise(r => setTimeout(r, 600));
                const poll = await fetch(opUrl, { headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY } });
                const data = await poll.json();
                if (data.status === 'succeeded') {
                    setResult(data.analyzeResult);
                    showToast('Analysis complete ✓', 'success');
                    return;
                }
                if (data.status === 'failed') throw new Error(data.error?.message || 'Analysis failed');
            }
            throw new Error('Timeout');
        } catch (err) {
            showToast(err.message || 'Analysis failed', 'error');
        } finally {
            setIsAnalyzing(false); setAnalyzeStatus('');
        }
    }, [file, isAnalyzing, model, showToast]);

    // ── Copy helpers ─────────────────────────────────────────
    const copyText = useCallback(async (text) => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); showToast('Copied!', 'success'); }
        catch { showToast('Copy failed', 'error'); }
    }, [showToast]);

    const downloadJson = useCallback(() => {
        if (!result) return;
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'result.json'; a.click();
    }, [result]);

    // ── Flat field list (no grouping) ────────────────────────
    const flatFields = useCallback(() => {
        if (!result?.documents?.[0]?.fields) return [];
        return Object.entries(result.documents[0].fields)
            .map(([name, fv], i) => ({ name, fv, index: i }))
            .filter(f => f.fv != null);
    }, [result]);

    // ── Render ───────────────────────────────────────────────
    const hl = highlights();
    const ff = flatFields();
    const rawJson = result ? JSON.stringify(result, null, 2) : '';
    const docType = result?.documents?.[0]?.docType || model;

    return (
        <div className="flex h-screen overflow-hidden bg-slate-100 font-sans">


            {/* ══════════ MAIN AREA ══════════ */}
            <div className="flex-1 flex flex-col overflow-hidden">

                {/* ── HEADER ── */}
                <header className="h-14 bg-white border-b border-slate-200 flex items-center px-5 gap-4 flex-shrink-0 shadow-sm z-10">
                    <div className="flex-1 min-w-0">
                        {file ? (
                            <div className="flex items-center gap-2">
                                <FileText size={15} className="text-[#002060] flex-shrink-0" />
                                <span className="text-sm font-semibold text-slate-800 truncate">{file.name}</span>
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 flex-shrink-0">
                                    {docType}
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Sparkles size={15} className="text-[#FF8C00]" />
                                <span className="text-sm font-semibold text-slate-700">Document Intelligence Dashboard</span>
                            </div>
                        )}
                    </div>

                    {/* Model select */}
                    <select
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-slate-50 outline-none focus:border-[#002060] focus:ring-1 focus:ring-[#002060]/20 cursor-pointer"
                    >
                        {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>

                    {/* Add File (ghost) */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#002060] border-2 border-[#002060] rounded-lg hover:bg-[#002060] hover:text-white transition-all duration-150"
                    >
                        <Plus size={14} />
                        Add File
                    </button>
                    <input ref={fileInputRef} type="file" className="hidden" accept=".png,.jpg,.jpeg,.bmp,.tiff,.pdf" onChange={e => handleFile(e.target.files[0])} />

                    {/* Run Analysis */}
                    <button
                        onClick={runAnalysis}
                        disabled={!file || isAnalyzing}
                        className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-150
              ${file && !isAnalyzing
                                ? 'bg-[#002060] text-white hover:bg-[#001a4f] shadow-md hover:shadow-glow-navy'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                    >
                        {isAnalyzing
                            ? <><Loader2 size={14} className="animate-spin-fast" />{analyzeStatus || 'Analyzing…'}</>
                            : <><Play size={14} /> Run Analysis</>}
                    </button>

                    {/* Panel toggle */}
                    <button
                        onClick={() => setPanelOpen(o => !o)}
                        title={panelOpen ? 'Hide panel' : 'Show panel'}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all"
                    >
                        {panelOpen ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                </header>

                {/* ── WORKSPACE ── */}
                <div className="flex flex-1 overflow-hidden">

                    {/* ══════ DOCUMENT VIEWER ══════ */}
                    <div
                        ref={imgContainerRef}
                        className="flex-1 relative overflow-auto bg-slate-200/60"
                        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={onDrop}
                    >
                        {/* Background pattern */}
                        <div
                            className="absolute inset-0 opacity-30 pointer-events-none"
                            style={{ backgroundImage: 'radial-gradient(circle,#94a3b8 1px,transparent 1px)', backgroundSize: '24px 24px' }}
                        />

                        {!file ? (
                            /* ── EMPTY STATE ── */
                            <div className={`absolute inset-0 flex items-center justify-center p-8 transition-all
                ${isDragging ? 'bg-blue-50/80' : ''}`}
                            >
                                <div className={`max-w-md w-full rounded-3xl border-2 border-dashed p-12 flex flex-col items-center gap-5 text-center transition-all duration-200
                  ${isDragging
                                        ? 'border-[#FF8C00] bg-orange-50 scale-100 shadow-glow-orange'
                                        : 'border-slate-300 bg-white/80 shadow-2xl backdrop-blur-sm hover:border-[#002060]/40 hover:shadow-glow-navy'}`}
                                >
                                    <div className="w-20 h-20 bg-gradient-to-br from-[#002060] to-blue-600 rounded-2xl flex items-center justify-center shadow-xl animate-float">
                                        <Upload size={36} className="text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-800 mb-1">Drop your document here</h2>
                                        <p className="text-sm text-slate-500">or click <strong>Add File</strong> in the header</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        {['PDF', 'PNG', 'JPG', 'TIFF', 'BMP'].map(t => (
                                            <span key={t} className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">{t}</span>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-[#002060] text-white text-sm font-bold rounded-xl hover:bg-[#001a4f] shadow-md hover:shadow-glow-navy transition-all duration-150"
                                    >
                                        <Plus size={16} /> Browse Files
                                    </button>
                                    {isDragging && (
                                        <p className="text-orange-500 font-bold text-sm animate-pulse">Release to upload!</p>
                                    )}
                                </div>
                            </div>
                        ) : file.type === 'pdf' ? (
                            /* ── PDF VIEW: full canvas-based page renderer ── */
                            <div className="flex flex-1 overflow-hidden absolute inset-0">
                                <PdfViewer file={file} zoom={zoom} />
                            </div>
                        ) : (
                            /* ── IMAGE VIEW ── */
                            <div className="absolute inset-0 flex items-center justify-center p-6">
                                <div
                                    className="relative shadow-2xl"
                                    style={{
                                        transform: `scale(${zoom / 100}) rotate(${rotate}deg)`,
                                        transformOrigin: 'center center',
                                        transition: 'transform 0.2s ease',
                                    }}
                                >
                                    <img
                                        ref={imgRef}
                                        src={file.src}
                                        alt={file.name}
                                        className="block"
                                        style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
                                        onLoad={e => {
                                            const naturalW = e.target.naturalWidth;
                                            const naturalH = e.target.naturalHeight;
                                            setImgDims({ w: naturalW, h: naturalH });
                                            setRenderDims({ w: e.target.offsetWidth, h: e.target.offsetHeight });
                                            // Auto-fit: calculate zoom to fill container
                                            if (imgContainerRef.current) {
                                                const cW = imgContainerRef.current.clientWidth - 48;
                                                const cH = imgContainerRef.current.clientHeight - 48;
                                                const fitZ = Math.min(cW / naturalW, cH / naturalH) * 100;
                                                setZoom(Math.max(20, Math.min(100, Math.round(fitZ))));
                                            }
                                        }}
                                        draggable={false}
                                    />
                                    <BoundingBoxOverlay
                                        highlights={hl}
                                        imgW={imgDims.w}
                                        imgH={imgDims.h}
                                        renderW={renderDims.w}
                                        renderH={renderDims.h}
                                        activeField={activeField}
                                    />
                                </div>
                            </div>
                        )}

                        {/* ── FLOATING GLASSMORPHISM TOOLBAR ── */}
                        {file && (
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass-dark rounded-2xl px-4 py-2.5 flex items-center gap-1 shadow-2xl z-10">
                                <button onClick={() => setZoom(z => Math.max(30, z - 15))} className="p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition-all" title="Zoom Out">
                                    <ZoomOut size={16} />
                                </button>
                                <span className="text-white/90 text-xs font-mono w-12 text-center font-bold">{zoom}%</span>
                                <button onClick={() => setZoom(z => Math.min(300, z + 15))} className="p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition-all" title="Zoom In">
                                    <ZoomIn size={16} />
                                </button>
                                <div className="w-px h-5 bg-white/20 mx-1" />
                                <button onClick={() => setRotate(r => (r + 90) % 360)} className="p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition-all" title="Rotate">
                                    <RotateCw size={16} />
                                </button>
                                <div className="w-px h-5 bg-white/20 mx-1" />
                                <button
                                    onClick={() => { setFile(null); setResult(null); setActiveField(null); setZoom(100); setRotate(0); }}
                                    className="p-2 text-red-300 hover:text-red-200 hover:bg-red-500/20 rounded-lg transition-all" title="Remove File"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        )}

                        {/* Analyzing overlay */}
                        {isAnalyzing && (
                            <div className="absolute inset-0 bg-[#002060]/40 backdrop-blur-sm flex items-center justify-center z-20">
                                <div className="bg-white rounded-2xl px-10 py-8 shadow-2xl flex flex-col items-center gap-4">
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-full border-[3px] border-slate-200" />
                                        <div className="w-14 h-14 rounded-full border-[3px] border-[#FF8C00] border-t-transparent animate-spin-fast absolute inset-0" />
                                        <ScanLine size={22} className="absolute inset-0 m-auto text-[#002060]" />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-[#002060] text-base">Analyzing Document</p>
                                        <p className="text-sm text-slate-500 mt-0.5">{analyzeStatus}</p>
                                    </div>
                                    <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-[#002060] to-[#FF8C00] rounded-full w-2/3 animate-pulse" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ══════ RIGHT DATA PANEL ══════ */}
                    <div className={`flex-shrink-0 bg-white border-l border-slate-200 flex flex-col panel-transition overflow-hidden
            ${panelOpen ? 'w-[400px] opacity-100' : 'w-0 opacity-0'}`}>

                        {/* Tabs */}
                        <div className="flex border-b border-slate-200 flex-shrink-0 bg-white">
                            {[
                                { id: 'content', label: 'Content' },
                                { id: 'result', label: 'Result' },
                                { id: 'code', label: 'Code' },
                            ].map(({ id, label }) => (
                                <button
                                    key={id}
                                    onClick={() => setActiveTab(id)}
                                    className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-all
                    ${activeTab === id
                                            ? 'border-[#002060] text-[#002060]'
                                            : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* ── CONTENT TAB ── */}
                        {activeTab === 'content' && (
                            <div className="flex-1 overflow-y-auto scrollbar-thin">
                                {!result?.content ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-2">
                                            <FileText size={28} className="text-slate-300" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-500">No content yet</p>
                                            <p className="text-xs text-slate-400 mt-1">Run analysis to extract text</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-4 animate-fade-in group">
                                        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                                            <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Extracted Text</p>
                                            <button
                                                onClick={() => copyText(result.content)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:text-[#002060] px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-[#002060] hover:bg-blue-50 bg-white shadow-sm"
                                            >
                                                {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />} Copy All
                                            </button>
                                        </div>
                                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-mono select-text selection:bg-[#FF8C00]/20 selection:text-slate-900 cursor-text">{result.content}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── RESULT TAB ── */}
                        {activeTab === 'result' && (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase flex-1">Raw JSON Response</span>
                                    <button onClick={() => copyText(rawJson)} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-200 transition-all">
                                        {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />} Copy
                                    </button>
                                    <button onClick={downloadJson} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-200 transition-all">
                                        <Download size={11} /> Save
                                    </button>
                                </div>
                                <div className="flex-1 overflow-auto bg-[#0d1117]">
                                    {result
                                        ? <JsonHighlight json={rawJson} />
                                        : <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data yet</div>}
                                </div>
                            </div>
                        )}

                        {/* ── CODE TAB ── */}
                        {activeTab === 'code' && (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                                    <span className="bg-[#FF8C00] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Python</span>
                                    <span className="text-[10px] text-slate-400 flex-1">Azure SDK example</span>
                                    <button onClick={() => copyText(generatePython(model))} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-200 transition-all">
                                        {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />} Copy
                                    </button>
                                </div>
                                <div className="flex-1 overflow-auto bg-[#0d1117]">
                                    <pre className="text-xs font-mono text-slate-300 p-4 leading-relaxed whitespace-pre">
                                        {generatePython(model)}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ══════ TOAST ══════ */}
            {toast && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl text-white text-sm font-semibold z-50 animate-fade-in
          ${toast.type === 'success' ? 'bg-emerald-600'
                        : toast.type === 'error' ? 'bg-red-600'
                            : 'bg-[#002060]'}`}
                >
                    {toast.type === 'success' ? <Check size={15} />
                        : toast.type === 'error' ? <AlertCircle size={15} />
                            : <Sparkles size={15} />}
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
