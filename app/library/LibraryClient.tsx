'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { UIMessage } from 'ai';
import {
  ArrowDownUp, ArrowLeft, ClipboardPaste, FileText, FileType2, Loader2, Minus, PencilLine, Plus,
  Save, Search, Sparkles, Tags, Trash2, Upload, X, Volume2, Pause, Play, Square, MessageSquare, Users,
} from 'lucide-react';
import type { Document, FileType, SavedExplanation } from '@/lib/types';
import {
  listDocuments, createDocument, updateDocument, deleteDocument,
  getFile, getHtmlOverride, setHtmlOverride, getClubDocByLocalId, listClubDocs,
} from '@/lib/storage';
import { extractPdfText } from '@/lib/pdf-text';
import { convertDocxBlobToHtml } from '@/lib/docx-html';
import { textToHtml } from '@/lib/reader-html';
import type { SharedExp } from '@/lib/club/share';
import ExplainPopover from './ExplainPopover';
import SavedExplanationsDrawer from './SavedExplanationsDrawer';
import { EditorToolbar } from '@/components/editor-toolbar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TagInput } from '@/components/tag-input';
import dynamic from 'next/dynamic';
import { SettingsDialog } from '@/components/settings-dialog';
import { useApiKey } from '@/lib/use-api-key';
// The in-viewer "Publish to club" button is dynamic-imported ONLY when the
// build-time flag is set, so all club code (its actions, the API client,
// DOMPurify) stays in a club chunk excluded from the default client bundle.
// LibraryClient itself keeps NO static club imports. Enforced by
// scripts/check-flag-off-parity.mjs.
const CLUB_BUILD = process.env.NEXT_PUBLIC_CLUB_ENABLED === 'true';
const PublishToClubButton = CLUB_BUILD
  ? dynamic(() => import('./PublishToClubButton'), { ssr: false })
  : null;
// Loader for the club share helpers. Putting the dynamic import() in a ternary
// branch keyed on the build flag (same shape as next/dynamic above) lets the
// bundler dead-code-eliminate it in the flag-off build — a bare import() inside
// an `if (CLUB_BUILD)` block still emits a (non-whitelisted) chunk and trips the
// flag-off parity gate.
const loadClubShare = CLUB_BUILD ? () => import('@/lib/club/share') : null;
const LibrarySyncCard = CLUB_BUILD
  ? dynamic(() => import('./LibrarySyncCard'), { ssr: false })
  : null;

// PDF.js touches DOMMatrix at module load — defer to client-only.
const PdfViewer = dynamic(
  () => import('@/components/pdf-viewer').then(m => m.PdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
        Loading PDF renderer…
      </div>
    ),
  },
);

const TTS_VOICES = [
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava (F)' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma (F)' },
  { id: 'en-US-BrianMultilingualNeural', label: 'Brian (M)' },
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew (M)' },
  { id: 'en-US-RogerNeural', label: 'Roger (M)' },
  { id: 'en-GB-RyanNeural', label: 'Ryan (UK, M)' },
] as const;

type SortMode = 'date-desc' | 'date-asc' | 'title' | 'size-desc';
const SORT_LABELS: Record<SortMode, string> = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  title: 'Title (A–Z)',
  'size-desc': 'Largest first',
};

const WELCOME_SEEN_KEY = 'readaura-welcome-seen';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Accepted upload formats. Markdown is stored as plain text (fileType 'txt').
const UPLOAD_ACCEPT = '.pdf,.docx,.txt,.md';
const ACCEPTED_EXTS = ['pdf', 'docx', 'txt', 'md'];

function fileTypeForExt(ext: string | undefined): FileType | null {
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt' || ext === 'md') return 'txt';
  return null;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

// Fall back to the first usable line when a pasted text has no explicit title.
// Leading Markdown heading markers are stripped; lines that are only markers
// are skipped so the next real line is used.
function deriveTitleFromText(text: string): string {
  for (const line of text.split('\n')) {
    const cleaned = line.replace(/^\s*#+\s*/, '').slice(0, 80).trim();
    if (cleaned) return cleaned;
  }
  return 'Untitled';
}

type Props = {
  aiConfigured: boolean;
  // Threaded through for Phase 2+, where the club UI is dynamic-imported behind
  // this flag. Intentionally unconsumed in Phase 1 so the rendered DOM and
  // behaviour are byte-for-byte unchanged when the flag is off.
  clubEnabled: boolean;
};

export default function LibraryClient({ aiConfigured: serverHasEnvKey, clubEnabled }: Props) {
  const { hasKey: clientHasKey, hydrated: apiKeyHydrated } = useApiKey();
  // Until we've read localStorage, optimistically assume AI is configured.
  // This avoids the "missing key" banner flashing for users who have saved a
  // key but haven't hydrated yet. Users with no key see the banner appear
  // ~1 frame after mount — acceptable.
  const aiConfigured = serverHasEnvKey || (apiKeyHydrated ? clientHasKey : true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docsLoaded, setDocsLoaded] = useState(false);

  // Hydrate the library from IndexedDB on mount.
  useEffect(() => {
    let cancelled = false;
    listDocuments().then(docs => {
      if (!cancelled) {
        setDocuments(docs);
        setDocsLoaded(true);
      }
    }).catch(() => { if (!cancelled) setDocsLoaded(true); });
    return () => { cancelled = true; };
  }, []);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const router = useRouter();
  const [error, setError] = useState('');
  const [docxHtml, setDocxHtml] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  // Unified rich-text editor (used for both TXT and DOCX viewers).
  const [editing, setEditing] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Welcome modal
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(WELCOME_SEEN_KEY)) setShowWelcome(true);
  }, []);
  const dismissWelcome = () => {
    if (typeof window !== 'undefined') localStorage.setItem(WELCOME_SEEN_KEY, '1');
    setShowWelcome(false);
  };

  // TTS state
  const [ttsActive, setTtsActive] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsVoice, setTtsVoice] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tts-voice') || TTS_VOICES[0].id;
    }
    return TTS_VOICES[0].id;
  });
  const [ttsRate, setTtsRate] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return parseFloat(localStorage.getItem('tts-rate') || '1');
    }
    return 1;
  });
  type TtsItem =
    | { type: 'text'; text: string; element: Element | null }
    | { type: 'table' | 'image'; text: ''; element: Element | null };
  const ttsItemsRef = useRef<TtsItem[]>([]);
  const ttsIndexRef = useRef(0);
  const ttsCancelledRef = useRef(false);
  const ttsGenRef = useRef(0);
  const [ttsProgress, setTtsProgress] = useState({ current: 0, total: 0 });
  const [ttsPauseReason, setTtsPauseReason] = useState<'table' | 'image' | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const pdfObjectUrlRef = useRef<string | null>(null);

  // Viewer ref for selection + TTS highlighting
  const docxViewerRef = useRef<HTMLDivElement>(null);
  // Always-mounted Edit/Save button — focus returns here when leaving edit mode
  // so keyboard/SR focus doesn't fall back to <body>.
  const editButtonRef = useRef<HTMLButtonElement>(null);

  // Selection / explain state
  type SelectionInfo = {
    text: string;
    contextBefore: string;
    contextAfter: string;
    blockTtsIndex: number | null;
    rect: { top: number; left: number; width: number };
  };
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [activeSelection, setActiveSelection] = useState<SelectionInfo | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [continueFromThread, setContinueFromThread] = useState<SavedExplanation | null>(null);
  const [explanationsRefreshKey, setExplanationsRefreshKey] = useState(0);

  // Shared explanations (club docs): fetched from the backend, rendered both in
  // the panel and as right-margin bubbles anchored by block index.
  const [sharedExps, setSharedExps] = useState<SharedExp[]>([]);
  const [sharedBubbles, setSharedBubbles] = useState<{ blockIndex: number; top: number; exps: SharedExp[] }[]>([]);
  const [viewingShared, setViewingShared] = useState<SharedExp[] | null>(null);
  // Local cache ids of club docs opened from OTHERS — kept for speed but hidden
  // from the Library list and opened read-only. Own published docs stay visible.
  const [hiddenClubIds, setHiddenClubIds] = useState<Set<string>>(new Set());
  // The open doc's club link, if any (null = not a club doc).
  const [selectedClubLink, setSelectedClubLink] = useState<{ mine: boolean } | null>(null);
  // Bumped when the open doc's content changes (edit saved), so the club button
  // re-checks whether local now differs from the published version.
  const [editVersion, setEditVersion] = useState(0);

  useEffect(() => {
    const viewer = docxViewerRef.current;
    if (!viewer || editing) return;

    const handlePointerUp = () => {
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          setSelectionInfo(null);
          return;
        }
        const text = selection.toString().trim();
        if (text.length === 0 || text.length > 2000) {
          setSelectionInfo(null);
          return;
        }
        const v = docxViewerRef.current;
        if (!v) return;
        const anchorIn = selection.anchorNode && v.contains(selection.anchorNode);
        const focusIn = selection.focusNode && v.contains(selection.focusNode);
        if (!anchorIn || !focusIn) {
          setSelectionInfo(null);
          return;
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const fullText = v.textContent || '';
        const idx = fullText.indexOf(text);
        const contextBefore = idx >= 0 ? fullText.slice(Math.max(0, idx - 500), idx) : '';
        const contextAfter = idx >= 0 ? fullText.slice(idx + text.length, idx + text.length + 500) : '';

        // The block the selection starts in — its data-tts-index anchors a
        // shared explanation's margin bubble (stable across club members).
        const anchorNode = selection.anchorNode;
        const anchorEl = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null;
        const block = anchorEl?.closest('[data-tts-index]') as HTMLElement | null;
        const blockTtsIndex = block ? parseInt(block.getAttribute('data-tts-index') || '', 10) : null;

        setSelectionInfo({
          text, contextBefore, contextAfter,
          blockTtsIndex: Number.isNaN(blockTtsIndex) ? null : blockTtsIndex,
          rect: { top: rect.top, left: rect.left, width: rect.width },
        });
      }, 0);
    };

    const handleDocumentPointerDown = (e: PointerEvent) => {
      if (viewer.contains(e.target as Node)) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-explain-button]')) return;
      if (target.closest('[data-explain-popover]')) return;
      setSelectionInfo(null);
    };

    viewer.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    return () => {
      viewer.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
    };
  }, [editing, docxHtml, selectedDocument?.id]);

  const handleOpenExplain = () => {
    if (!selectionInfo) return;
    setActiveSelection(selectionInfo);
    setContinueFromThread(null);
    setExplainOpen(true);
  };

  const handleContinueExplanation = (exp: SavedExplanation) => {
    setActiveSelection(null);
    setContinueFromThread(exp);
    setExplainOpen(true);
    setDrawerOpen(false);
  };

  const handleCloseExplain = () => {
    setExplainOpen(false);
    setContinueFromThread(null);
    setActiveSelection(null);
    setSelectionInfo(null);
  };

  const handleExplanationSaved = (exp: SavedExplanation, opts?: { share?: boolean }) => {
    setExplanationsRefreshKey(k => k + 1); // refresh the local list immediately
    // Share to the club only when the user chose "Save to club" (opt-in). Club
    // code is dynamically imported so it never ships in the flag-off build.
    if (opts?.share && loadClubShare && selectedDocument) {
      const docId = selectedDocument.id;
      (async () => {
        try {
          const { pushShared } = await loadClubShare();
          await pushShared(docId, exp);
          setExplanationsRefreshKey(k => k + 1); // re-pull shared once it lands
        } catch { /* sharing is best-effort */ }
      })();
    }
  };

  // Cached copies of OTHERS' club docs are hidden from the Library list (read
  // them from the club instead). Own published docs (mine) stay visible.
  useEffect(() => {
    if (!CLUB_BUILD || !docsLoaded) { setHiddenClubIds(new Set()); return; }
    let cancelled = false;
    listClubDocs().then(links => {
      if (cancelled) return;
      setHiddenClubIds(new Set(
        links.filter(l => l.mine !== true && l.localDocumentId).map(l => l.localDocumentId as string),
      ));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [docsLoaded, documents]);

  // The open doc's club link (whether it's a club doc, and whether it's mine).
  useEffect(() => {
    if (!CLUB_BUILD || !selectedDocument) { setSelectedClubLink(null); return; }
    let cancelled = false;
    getClubDocByLocalId(selectedDocument.id).then(link => {
      if (!cancelled) setSelectedClubLink(link ? { mine: link.mine === true } : null);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocument?.id]);

  // Deleting a local explanation also unshares it from the club (best-effort).
  const handleExplanationDeleted = (id: string) => {
    setExplanationsRefreshKey(k => k + 1);
    if (loadClubShare) {
      (async () => {
        try {
          const { removeShared } = await loadClubShare();
          await removeShared(id);
          setExplanationsRefreshKey(k => k + 1);
        } catch { /* best-effort */ }
      })();
    }
  };

  // Pull shared explanations whenever the open doc changes or an explanation is
  // saved. Returns [] for non-club docs. The club layer is dynamically imported
  // behind CLUB_BUILD so it's dead-code-eliminated from the flag-off build.
  useEffect(() => {
    if (!selectedDocument) { setSharedExps([]); return; }
    let cancelled = false;
    if (loadClubShare) {
      const docId = selectedDocument.id;
      (async () => {
        try {
          const { pullShared } = await loadClubShare();
          const list = await pullShared(docId);
          if (!cancelled) setSharedExps(list);
        } catch { if (!cancelled) setSharedExps([]); }
      })();
    } else {
      setSharedExps([]);
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocument?.id, explanationsRefreshKey]);

  // Position a right-margin bubble next to each block that has shared
  // explanations (docx/txt only; PDFs show them in the panel). Recomputed when
  // the content or shared set changes.
  useEffect(() => {
    const viewer = docxViewerRef.current;
    if (!viewer || editing || !selectedDocument || selectedDocument.fileType === 'pdf') {
      setSharedBubbles([]);
      return;
    }
    const byBlock = new Map<number, SharedExp[]>();
    for (const e of sharedExps) {
      if (e.blockIndex == null) continue;
      byBlock.set(e.blockIndex, [...(byBlock.get(e.blockIndex) ?? []), e]);
    }
    const next: { blockIndex: number; top: number; exps: SharedExp[] }[] = [];
    byBlock.forEach((exps, idx) => {
      const el = viewer.querySelector(`[data-tts-index="${idx}"]`);
      if (el instanceof HTMLElement) next.push({ blockIndex: idx, top: el.offsetTop, exps });
    });
    setSharedBubbles(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedExps, docxHtml, editing, selectedDocument?.id, selectedDocument?.fileType]);

  const continueInitialMessages: UIMessage[] | undefined = continueFromThread
    ? continueFromThread.messages.map((m): UIMessage => ({
        id: m.id,
        role: m.role,
        parts: [{ type: 'text', text: m.content }],
      }))
    : undefined;

  // TTS highlight (same logic, just retargeted at reader-prose)
  const [ttsHighlightIndex, setTtsHighlightIndex] = useState(-1);
  const ttsHighlightRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (ttsHighlightRef.current) {
      ttsHighlightRef.current.classList.remove('tts-current');
      ttsHighlightRef.current = null;
    }
    if (ttsHighlightIndex < 0) return;
    const viewer = docxViewerRef.current;
    if (!viewer) return;
    let target: HTMLElement | null = null;
    const allTagged = viewer.querySelectorAll<HTMLElement>('[data-tts-index]');
    for (const el of allTagged) {
      const idx = parseInt(el.getAttribute('data-tts-index') || '', 10);
      if (idx === ttsHighlightIndex) { target = el; break; }
      if (idx > ttsHighlightIndex) {
        target = (el.previousElementSibling as HTMLElement) || null;
        break;
      }
    }
    if (!target && allTagged.length > 0) target = allTagged[allTagged.length - 1];
    if (target) {
      target.classList.add('tts-current');
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      ttsHighlightRef.current = target;
    }
  }, [ttsHighlightIndex, docxHtml]);

  // Upload form refs (Dialog state)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emptyStateFileRef = useRef<HTMLInputElement>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [uploadTab, setUploadTab] = useState<'files' | 'paste'>('files');

  const allTags = useMemo(() => Array.from(new Set(documents.flatMap(d => d.tags))), [documents]);

  const resetUploadForm = () => {
    setUploadTitle('');
    setUploadTags([]);
    setUploadFiles([]);
    setPasteText('');
    setUploadTab('files');
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Also reset the empty-state picker so re-selecting the same file re-fires onChange.
    if (emptyStateFileRef.current) emptyStateFileRef.current.value = '';
  };

  const onPickFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files).filter(f =>
      ACCEPTED_EXTS.includes(f.name.split('.').pop()?.toLowerCase() ?? ''),
    );
    if (arr.length === 0) {
      setError('Only PDF, DOCX, TXT, and Markdown files are allowed.');
      return;
    }
    setUploadFiles(arr);
    setUploadTab('files');
    setShowUpload(true);
  };

  const handleUploadFiles = async () => {
    if (uploadFiles.length === 0) {
      setError('Pick a file first.');
      return;
    }
    setUploading(true);
    setError('');
    const errors: string[] = [];

    for (const file of uploadFiles) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const fileType = fileTypeForExt(ext);
      if (!fileType) {
        errors.push(`${file.name}: unsupported file type`);
        continue;
      }
      const baseName = stripExt(file.name);
      const title = uploadFiles.length === 1 && uploadTitle.trim()
        ? uploadTitle.trim()
        : uploadTitle.trim()
          ? `${uploadTitle.trim()} - ${baseName}`
          : baseName;
      try {
        await createDocument({
          blob: file,
          title,
          tags: uploadTags,
          fileType,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        errors.push(`${file.name}: ${msg}`);
      }
    }

    if (errors.length > 0) setError(errors.join('; '));
    setDocuments(await listDocuments());
    setUploading(false);
    if (errors.length === 0) {
      resetUploadForm();
      setShowUpload(false);
    }
  };

  const handlePasteUpload = async () => {
    const text = pasteText.trim();
    if (!text) { setError('Paste some text first.'); return; }
    setUploading(true);
    setError('');
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      await createDocument({
        blob,
        title: uploadTitle.trim() || deriveTitleFromText(text),
        tags: uploadTags,
        fileType: 'txt',
      });
      setDocuments(await listDocuments());
      resetUploadForm();
      setShowUpload(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
    setUploading(false);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onPickFiles(e.dataTransfer.files);
  };

  // Declared before its first use (handleDelete/handleView) so the deep-link
  // effect can safely capture handleView without a use-before-declare error.
  const stopTts = () => {
    setTtsHighlightIndex(-1);
    ttsCancelledRef.current = true;
    ttsGenRef.current++;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setTtsActive(false);
    setTtsPaused(false);
    setTtsLoading(false);
    setTtsPauseReason(null);
    setTtsProgress({ current: 0, total: 0 });
  };

  // Keep the open doc in the URL (/library?doc=<id>) so the viewer survives a
  // refresh and is a shareable link. Uses history.replaceState rather than the
  // Next router so it doesn't remount this client component (which would drop
  // the viewer/TTS state); the deep-link effect below re-opens it on load.
  // Hoisted above handleDelete/handleView (which call it) to avoid a
  // use-before-declare lint error, same as stopTts above.
  const syncDocUrl = useCallback((docId: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (docId) url.searchParams.set('doc', docId);
    else url.searchParams.delete('doc');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  // Close the viewer. A doc opened from the club (?from=club) returns to /club
  // where the user came from; a doc opened from the library returns to the list.
  const handleBack = () => {
    stopTts();
    setEditing(false);
    const fromClub = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('from') === 'club';
    if (fromClub) {
      router.push('/club');
      return;
    }
    setSelectedDocument(null);
    setDocxHtml('');
    syncDocUrl(null);
  };

  const handleDelete = async (documentId: string) => {
    await deleteDocument(documentId);
    setDocuments(prev => prev.filter(r => r.id !== documentId));
    setBulkSelected(prev => { const n = new Set(prev); n.delete(documentId); return n; });
    if (selectedDocument?.id === documentId) {
      setSelectedDocument(null);
      setDocxHtml('');
      stopTts();
      syncDocUrl(null);
    }
  };

  const startEdit = (r: Document) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditTags(r.tags);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditTags([]);
  };

  const saveEdit = async () => {
    if (!editingId || !editTitle.trim()) return;
    await updateDocument(editingId, { title: editTitle.trim(), tags: editTags });
    setDocuments(prev => prev.map(r =>
      r.id === editingId ? { ...r, title: editTitle.trim(), tags: editTags } : r
    ));
    if (selectedDocument?.id === editingId) {
      setSelectedDocument(prev => prev ? { ...prev, title: editTitle.trim(), tags: editTags } : prev);
    }
    cancelEdit();
  };

  // Bulk operations: add/remove tag across selected documents
  const applyBulkTag = async (action: 'add' | 'remove', tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    const idsToUpdate = Array.from(bulkSelected);
    await Promise.all(idsToUpdate.map(async id => {
      const doc = documents.find(d => d.id === id);
      if (!doc) return;
      const nextTags = action === 'add'
        ? Array.from(new Set([...doc.tags, t]))
        : doc.tags.filter(x => x !== t);
      await updateDocument(id, { title: doc.title, tags: nextTags });
    }));
    setDocuments(await listDocuments());
    setBulkTagOpen(false);
  };

  const bulkDelete = async () => {
    const ids = Array.from(bulkSelected);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} document${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    await Promise.all(ids.map(id => deleteDocument(id)));
    setDocuments(await listDocuments());
    setBulkSelected(new Set());
  };

  // ---- TTS plumbing (unchanged behavior) ----
  const splitLongText = (text: string, maxLen = 500): string[] => {
    if (text.length <= maxLen) return [text];
    const sentences = text.match(/[^.!?]+[.!?]+[\s)]*/g) || [text];
    const chunks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      if (current.length + sentence.length > maxLen && current.length > 0) {
        chunks.push(current.trim());
        current = '';
      }
      current += sentence;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.length > 0 ? chunks : [text];
  };

  const processDocxHtml = useCallback((rawHtml: string): { html: string; items: TtsItem[] } => {
    const items: TtsItem[] = [];
    const parser = new DOMParser();
    const docDom = parser.parseFromString(`<div>${rawHtml}</div>`, 'text/html');
    const container = docDom.body.firstElementChild!;
    // Drop any stale tags from a previous pass so re-processing edited HTML
    // (which already carries data-tts-index attributes) stays idempotent.
    container.querySelectorAll('[data-tts-index]').forEach(el => el.removeAttribute('data-tts-index'));
    const allEls = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, table');

    for (const el of allEls) {
      const tag = el.tagName.toLowerCase();
      if (tag !== 'table' && el.closest('table')) continue;
      // A blockquote that wraps its own block (e.g. <blockquote><p>…</p></blockquote>)
      // is read via that inner block; only tag a blockquote holding text directly
      // (what the toolbar's Quote button produces) so it isn't read twice.
      if (tag === 'blockquote' && el.querySelector('p, h1, h2, h3, h4, h5, h6, li')) continue;

      if (tag === 'table') {
        el.setAttribute('data-tts-index', String(items.length));
        items.push({ type: 'table', text: '', element: null });
        continue;
      }

      if (el.querySelector('img') && (el.textContent || '').trim().length === 0) {
        el.setAttribute('data-tts-index', String(items.length));
        items.push({ type: 'image', text: '', element: null });
        continue;
      }

      const text = (el.textContent || '').trim();
      if (text.length > 0) {
        el.setAttribute('data-tts-index', String(items.length));
        const chunks = splitLongText(text);
        for (const chunk of chunks) {
          items.push({ type: 'text', text: chunk, element: null });
        }
      }
    }

    return { html: container.innerHTML, items };
  }, []);

  const handleView = async (doc: Document) => {
    stopTts();
    setSelectedDocument(doc);
    syncDocUrl(doc.id);
    setDocxHtml('');
    ttsItemsRef.current = [];
    // Revoke any previously-created PDF object URL before we make a new one.
    if (pdfObjectUrlRef.current) {
      URL.revokeObjectURL(pdfObjectUrlRef.current);
      pdfObjectUrlRef.current = null;
      setPdfObjectUrl(null);
    }

    const blob = await getFile(doc.id);
    if (!blob) {
      setDocxHtml('<p>File data missing in browser storage.</p>');
      return;
    }

    if (doc.fileType === 'docx') {
      try {
        // Prefer the user's edited HTML if any; otherwise convert the DOCX
        // blob to HTML in the browser via mammoth.
        const override = await getHtmlOverride(doc.id);
        const rawHtml = override ?? await convertDocxBlobToHtml(blob);
        const { html, items } = processDocxHtml(rawHtml);
        // Fall back to an empty paragraph so a blank document stays viewable /
        // editable rather than getting stuck on the loading spinner.
        setDocxHtml(html || '<p></p>');
        ttsItemsRef.current = items;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load document.';
        setDocxHtml(`<p>${msg}</p>`);
      }
    } else if (doc.fileType === 'txt') {
      try {
        // Prefer the user's edited HTML (rich-text edits are persisted as an
        // override, same as DOCX); otherwise wrap the raw text into paragraphs.
        const override = await getHtmlOverride(doc.id);
        const rawHtml = override ?? textToHtml(await blob.text());
        const { html, items } = processDocxHtml(rawHtml);
        setDocxHtml(html || '<p></p>');
        ttsItemsRef.current = items;
      } catch {
        setDocxHtml('<p>Failed to load text.</p>');
      }
    } else if (doc.fileType === 'pdf') {
      // PDF.js renders pages with a real text layer (selection → Explain
      // works automatically). We also extract text so TTS can read the
      // document sequentially.
      const url = URL.createObjectURL(blob);
      pdfObjectUrlRef.current = url;
      setPdfObjectUrl(url);
      try {
        const text = (await extractPdfText(blob)).trim();
        if (text.length > 0) {
          const { items } = processDocxHtml(textToHtml(text));
          ttsItemsRef.current = items;
        } else {
          ttsItemsRef.current = [];
        }
      } catch {
        ttsItemsRef.current = [];
      }
    }
  };

  // Runs a contentEditable formatting command, keeping focus in the editor so
  // the active selection isn't lost (toolbar buttons also preventDefault).
  const execEditorCommand = useCallback((command: string, value?: string) => {
    const el = docxViewerRef.current;
    if (el) el.focus();
    try { document.execCommand(command, false, value); } catch { /* unsupported command */ }
  }, []);

  // Unified edit toggle for TXT and DOCX. Entering edit mode makes the
  // already-rendered viewer contentEditable; saving persists the HTML as an
  // override (the same store DOCX edits already use).
  const handleToggleEdit = async () => {
    if (editorSaving) return; // guard the keyboard (Cmd+S) path; the button is disabled
    if (!selectedDocument || !docxViewerRef.current) return;
    if (!editing) {
      setEditing(true);
      stopTts();
      setTimeout(() => docxViewerRef.current?.focus(), 0);
      return;
    }
    setEditorSaving(true);
    try {
      // Normalise an emptied editor to a single paragraph so the viewer never
      // collapses to the "Loading…" state (which would unmount the editable
      // node and lock the user out of re-editing).
      const raw = docxViewerRef.current.innerHTML;
      const editedHtml = raw.trim() ? raw : '<p></p>';
      await setHtmlOverride(selectedDocument.id, editedHtml);
      const { html, items } = processDocxHtml(editedHtml);
      setDocxHtml(html);
      ttsItemsRef.current = items;
      setEditVersion(v => v + 1); // content changed → let the club button re-check
      setEditing(false);
      setTimeout(() => editButtonRef.current?.focus(), 0);
    } catch {
      setError('Failed to save.');
    }
    setEditorSaving(false);
  };

  // Discard unsaved edits by restoring the last-rendered HTML into the
  // contentEditable node (React won't revert it on its own since docxHtml
  // hasn't changed).
  const handleCancelEdit = () => {
    if (docxViewerRef.current) docxViewerRef.current.innerHTML = docxHtml;
    setEditing(false);
    setTimeout(() => editButtonRef.current?.focus(), 0);
  };

  // Deep-link: /library?doc=<id> opens that doc directly (e.g. after opening a
  // club doc from the /club page). Runs once after the library hydrates.
  useEffect(() => {
    if (!docsLoaded || typeof window === 'undefined') return;
    const docId = new URLSearchParams(window.location.search).get('doc');
    if (!docId) return;
    const target = documents.find(d => d.id === docId);
    if (target) handleView(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docsLoaded]);


  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); execEditorCommand('bold'); }
    else if (k === 'i') { e.preventDefault(); execEditorCommand('italic'); }
    else if (k === 'u') { e.preventDefault(); execEditorCommand('underline'); }
    else if (k === 's') { e.preventDefault(); handleToggleEdit(); }
  };

  const audioCacheRef = useRef<Map<string, string>>(new Map());

  const fetchParaAudio = useCallback(async (text: string, voice: string): Promise<string> => {
    const cacheKey = `${voice}::${text}`;
    const cached = audioCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) throw new Error('TTS failed');
    const blob = await res.blob();
    if (blob.size === 0) throw new Error('TTS returned empty audio');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    if (dataUrl.length < 100) throw new Error('TTS returned invalid audio');
    audioCacheRef.current.set(cacheKey, dataUrl);
    return dataUrl;
  }, []);

  const speakFnRef = useRef<(index: number) => void>(() => {});

  useEffect(() => {
    speakFnRef.current = async (index: number) => {
      const gen = ttsGenRef.current;
      const items = ttsItemsRef.current;
      if (index >= items.length || ttsCancelledRef.current) {
        setTtsHighlightIndex(-1);
        setTtsActive(false);
        setTtsPaused(false);
        setTtsLoading(false);
        return;
      }

      ttsIndexRef.current = index;
      setTtsProgress({ current: index + 1, total: items.length });
      setTtsHighlightIndex(index);

      const item = items[index];

      if (item.type === 'table' || item.type === 'image') {
        setTtsLoading(false);
        setTtsPaused(true);
        setTtsPauseReason(item.type);
        return;
      }

      setTtsLoading(true);
      try {
        const voice = ttsVoice;
        const audioUrl = await fetchParaAudio(item.text, voice);
        if (gen !== ttsGenRef.current || ttsCancelledRef.current) return;

        let prefetched = 0;
        for (let next = index + 1; next < items.length && prefetched < 3; next++) {
          if (items[next].type === 'text') {
            fetchParaAudio(items[next].text, voice).catch(() => {});
            prefetched++;
          }
        }

        const audio = audioRef.current;
        if (!audio) return;
        audio.onended = null;
        audio.onerror = null;
        audio.src = audioUrl;
        audio.playbackRate = ttsRate;
        setTtsLoading(false);
        audio.onended = () => {
          if (gen === ttsGenRef.current && !ttsCancelledRef.current) {
            speakFnRef.current(index + 1);
          }
        };
        await audio.play();
      } catch {
        setTtsLoading(false);
        if (gen === ttsGenRef.current && !ttsCancelledRef.current) {
          speakFnRef.current(index + 1);
        }
      }
    };
  });


  const handleReadAloud = async () => {
    if (!selectedDocument) return;
    if (ttsActive && !ttsPaused) {
      audioRef.current?.pause();
      setTtsPaused(true);
      return;
    }
    if (ttsActive && ttsPaused) {
      if (ttsPauseReason) {
        setTtsPaused(false);
        setTtsPauseReason(null);
        speakFnRef.current(ttsIndexRef.current + 1);
      } else {
        audioRef.current?.play();
        setTtsPaused(false);
      }
      return;
    }
    try {
      // All file types now eagerly populate ttsItemsRef in handleView.
      if (ttsItemsRef.current.length === 0) {
        setError('No content found to read.');
        return;
      }
      ttsIndexRef.current = 0;
      ttsCancelledRef.current = false;
      ttsGenRef.current++;
      setTtsActive(true);
      setTtsPaused(false);

      const voice = ttsVoice;
      let prefetched = 0;
      for (let i = 1; i < ttsItemsRef.current.length && prefetched < 3; i++) {
        if (ttsItemsRef.current[i].type === 'text') {
          fetchParaAudio(ttsItemsRef.current[i].text, voice).catch(() => {});
          prefetched++;
        }
      }
      speakFnRef.current(0);
    } catch {
      setError('Failed to load text for reading.');
    }
  };

  const handleDocxClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ttsActive || ttsItemsRef.current.length === 0) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) return;
    const target = e.target as HTMLElement;
    const tagged = target.closest('[data-tts-index]') as HTMLElement | null;
    if (!tagged) return;
    const itemIndex = parseInt(tagged.getAttribute('data-tts-index') || '', 10);
    if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= ttsItemsRef.current.length) return;
    jumpTtsToIndex(itemIndex);
  };

  // Click-to-start / click-to-jump for PDFs. The PDF.js text layer doesn't
  // carry data-tts-index attributes, so we look up the clicked text against
  // the cached extracted TTS items by substring match (whitespace-normalised).
  const handlePdfClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (ttsItemsRef.current.length === 0) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) return;

    const target = e.target as HTMLElement;
    const span = target.closest('span');
    if (!span) return; // ignore clicks outside text layer (page margins, canvas)
    const clickedText = (span.textContent || '').trim();
    if (!clickedText) return;

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const sig = norm(clickedText).slice(0, 40);
    if (sig.length < 5) return;

    let itemIndex = -1;
    for (let i = 0; i < ttsItemsRef.current.length; i++) {
      const item = ttsItemsRef.current[i];
      if (item.type === 'text' && norm(item.text).includes(sig)) {
        itemIndex = i;
        break;
      }
    }
    if (itemIndex < 0) return;
    jumpTtsToIndex(itemIndex);
  };

  const jumpTtsToIndex = (itemIndex: number) => {
    ttsGenRef.current++;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    ttsCancelledRef.current = false;
    setTtsPaused(false);
    setTtsPauseReason(null);
    if (!ttsActive) setTtsActive(true);

    const voice = ttsVoice;
    let prefetched = 0;
    for (let i = itemIndex + 1; i < ttsItemsRef.current.length && prefetched < 3; i++) {
      if (ttsItemsRef.current[i].type === 'text') {
        fetchParaAudio(ttsItemsRef.current[i].text, voice).catch(() => {});
        prefetched++;
      }
    }
    speakFnRef.current(itemIndex);
  };

  useEffect(() => {
    const audio = audioRef.current;
    const cache = audioCacheRef.current;
    return () => {
      if (audio) { audio.pause(); audio.src = ''; }
      cache.clear();
      if (pdfObjectUrlRef.current) {
        URL.revokeObjectURL(pdfObjectUrlRef.current);
        pdfObjectUrlRef.current = null;
      }
    };
  }, []);

  // Filtered + sorted documents
  // Hide cached copies of others' club docs from the Library entirely.
  const visibleDocuments = useMemo(
    () => documents.filter(d => !hiddenClubIds.has(d.id)),
    [documents, hiddenClubIds],
  );

  const filtered = useMemo(() => {
    let arr = visibleDocuments;
    if (tagFilter) arr = arr.filter(d => d.tags.includes(tagFilter));
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.tags.some(t => t.toLowerCase().includes(q)) ||
        d.fileType.toLowerCase().includes(q),
      );
    }
    const sorted = [...arr];
    switch (sortMode) {
      case 'date-asc':
        sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'size-desc':
        sorted.sort((a, b) => b.fileSize - a.fileSize);
        break;
      case 'date-desc':
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return sorted;
  }, [visibleDocuments, tagFilter, search, sortMode]);

  const toggleBulkAll = () => {
    if (bulkSelected.size === filtered.length) setBulkSelected(new Set());
    else setBulkSelected(new Set(filtered.map(d => d.id)));
  };
  const toggleBulkOne = (id: string) => {
    setBulkSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const libraryIsEmpty = docsLoaded && visibleDocuments.length === 0;

  // A club doc opened from someone else is read-only (no edit). Any club-linked
  // doc can have its explanations saved to the club.
  const isForeignClubDoc = selectedClubLink?.mine === false;
  const canShareToClub = selectedClubLink != null;

  // Upload-dialog title hints. The title is always optional; the placeholder
  // and helper text make the fallback (file name / first line) explicit.
  const derivedFileTitle = uploadFiles.length === 1 ? stripExt(uploadFiles[0].name) : '';
  const uploadTitlePlaceholder = uploadTab === 'files'
    ? (derivedFileTitle || 'Document title…')
    : 'Document title…';
  const uploadTitleHelp = uploadTab === 'paste'
    ? 'Optional — the first line of the text is used if left blank.'
    : uploadFiles.length > 1
      ? 'Optional — each file uses its own name (any title you type is added as a prefix).'
      : derivedFileTitle
        ? `Optional — defaults to “${derivedFileTitle}”.`
        : 'Optional — defaults to the file name.';

  // ====== Render ======
  return (
    <main className={cn(
      'mx-auto px-4 py-6 sm:px-6',
      selectedDocument ? 'max-w-7xl' : 'max-w-6xl',
    )}>
      {/* Drag-drop overlay (whole page) */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative"
      >
        {dragOver && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/40 backdrop-blur-sm">
            <div className="rounded-xl border-2 border-dashed border-primary bg-background/90 px-8 py-6 text-center">
              <Upload className="mx-auto mb-2 h-8 w-8 text-primary" />
              <div className="text-lg font-medium">Drop to upload</div>
              <div className="text-sm text-muted-foreground">PDF, DOCX, TXT &amp; Markdown</div>
            </div>
          </div>
        )}

        {!selectedDocument ? (
          /* ===== Library view ===== */
          <>
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
                <p className="text-sm text-muted-foreground">
                  {visibleDocuments.length} document{visibleDocuments.length === 1 ? '' : 's'}
                </p>
              </div>
              <Button onClick={() => setShowUpload(true)}>
                <Upload className="h-4 w-4" /> Upload
              </Button>
            </div>

            {!aiConfigured && (
              <Card className="mb-4 border-destructive/40 bg-destructive/5">
                <CardContent className="flex items-start gap-3 p-4 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="flex-1">
                    <div className="font-medium text-destructive">AI explanations disabled</div>
                    <div className="text-muted-foreground">
                      Add your NVIDIA API key in Settings to enable highlight-to-explain. Get a free key at{' '}
                      <a className="underline" href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer">build.nvidia.com</a>. Uploading, reading, and TTS work without it.
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                    Add key
                  </Button>
                </CardContent>
              </Card>
            )}

            {error && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {LibrarySyncCard && (
              <LibrarySyncCard onSynced={() => { listDocuments().then(setDocuments); }} />
            )}

            {!libraryIsEmpty && (
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by title, tag, or type..."
                    className="pl-8"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="justify-start gap-2 sm:justify-between">
                      <ArrowDownUp className="h-4 w-4" />
                      <span>{SORT_LABELS[sortMode]}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={sortMode} onValueChange={v => setSortMode(v as SortMode)}>
                      <DropdownMenuRadioItem value="date-desc">Newest first</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="date-asc">Oldest first</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="title">Title (A–Z)</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="size-desc">Largest first</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {allTags.length > 0 && !libraryIsEmpty && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                <Button
                  variant={tagFilter === null ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTagFilter(null)}
                  className="h-7"
                >All</Button>
                {allTags.map(tag => (
                  <Button
                    key={tag}
                    variant={tagFilter === tag ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
                    className="h-7"
                  >{tag}</Button>
                ))}
              </div>
            )}

            {/* Bulk action bar */}
            {bulkSelected.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm">
                <span><strong>{bulkSelected.size}</strong> selected</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setBulkTagOpen(true)}>
                    <Tags className="h-4 w-4" /> <span className="hidden sm:inline">Edit tags</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={bulkDelete} className="text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setBulkSelected(new Set())}>
                    <X className="h-4 w-4" /> <span className="hidden sm:inline">Clear</span>
                  </Button>
                </div>
              </div>
            )}

            {libraryIsEmpty ? (
              <Card className="mt-4 border-dashed">
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <div className="rounded-full bg-muted p-3">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-medium">Your library is empty</div>
                    <p className="text-sm text-muted-foreground">
                      Drop a PDF, DOCX, TXT, or Markdown file anywhere on this page, or pick one below.
                    </p>
                  </div>
                  <input
                    ref={emptyStateFileRef}
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    multiple
                    className="hidden"
                    onChange={e => onPickFiles(e.target.files)}
                  />
                  <Button onClick={() => emptyStateFileRef.current?.click()}>
                    <Upload className="h-4 w-4" /> Choose file
                  </Button>
                </CardContent>
              </Card>
            ) : filtered.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
                No documents match the current filter.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="w-8 p-2 text-left sm:w-10 sm:p-3">
                        <Checkbox
                          checked={bulkSelected.size > 0 && bulkSelected.size === filtered.length}
                          onCheckedChange={toggleBulkAll}
                          aria-label="Select all"
                        />
                      </th>
                      <th className="p-2 text-left sm:p-3">Title</th>
                      <th className="hidden p-3 text-left sm:table-cell">Type</th>
                      <th className="hidden p-3 text-left md:table-cell">Tags</th>
                      <th className="hidden p-3 text-left md:table-cell">Date</th>
                      <th className="hidden p-3 text-left lg:table-cell">Size</th>
                      <th className="p-2 text-right sm:p-3">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr
                        key={r.id}
                        className={`border-t border-border transition-colors hover:bg-muted/30 ${editingId === r.id ? '' : 'cursor-pointer'}`}
                        onClick={editingId === r.id ? undefined : () => handleView(r)}
                      >
                        {editingId === r.id ? (
                          <td colSpan={7} className="p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <Input
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                                placeholder="Title"
                                autoFocus
                                className="flex-1"
                              />
                              <div className="min-w-[200px] flex-1">
                                <TagInput value={editTags} onChange={setEditTags} suggestions={allTags} placeholder="Add tags…" />
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" onClick={saveEdit}><Save className="h-3.5 w-3.5" /> Save</Button>
                                <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                              </div>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="p-2 sm:p-3" onClick={e => e.stopPropagation()}>
                              <Checkbox
                                checked={bulkSelected.has(r.id)}
                                onCheckedChange={() => toggleBulkOne(r.id)}
                                aria-label={`Select ${r.title}`}
                              />
                            </td>
                            <td className="p-2 font-medium sm:p-3">
                              <div className="flex min-w-0 items-center gap-2">
                                {r.fileType === 'pdf' ? <FileType2 className="h-4 w-4 shrink-0 text-muted-foreground" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                <span className="truncate">{r.title}</span>
                              </div>
                            </td>
                            <td className="hidden p-3 text-muted-foreground sm:table-cell">
                              {r.fileType.toUpperCase()}
                            </td>
                            <td className="hidden p-3 md:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {r.tags.map(t => (
                                  <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>
                                ))}
                              </div>
                            </td>
                            <td className="hidden p-3 text-muted-foreground md:table-cell">
                              {r.createdAt.slice(0, 10)}
                            </td>
                            <td className="hidden p-3 text-muted-foreground lg:table-cell">
                              {formatFileSize(r.fileSize)}
                            </td>
                            <td className="p-2 text-right sm:p-3" onClick={e => e.stopPropagation()}>
                              <div className="flex justify-end gap-0.5 sm:gap-1">
                                <Button size="icon-sm" variant="ghost" onClick={() => startEdit(r)} aria-label="Edit">
                                  <PencilLine className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon-sm" variant="ghost" onClick={() => handleDelete(r.id)} aria-label="Delete" className="text-destructive hover:bg-destructive/10">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          /* ===== Viewer view ===== */
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                >
                  <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
                </Button>
                <h2 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{selectedDocument.title}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {clubEnabled && PublishToClubButton && (
                  <PublishToClubButton doc={selectedDocument} contentVersion={editVersion} />
                )}
                <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
                  <MessageSquare className="h-4 w-4" /> <span className="hidden sm:inline">Explanations</span>
                </Button>
                {selectedDocument.fileType !== 'pdf' && !isForeignClubDoc && (
                  <Button ref={editButtonRef} size="sm" variant={editing ? 'default' : 'outline'} onClick={handleToggleEdit} disabled={editorSaving}>
                    {editorSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editing ? <Save className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{editing ? 'Save' : 'Edit'}</span>
                  </Button>
                )}
                {editing && (
                  <Button size="sm" variant="ghost" onClick={handleCancelEdit}>Cancel</Button>
                )}
              </div>
            </div>

            {/* TTS controls */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
              <Button size="sm" onClick={handleReadAloud} disabled={ttsLoading && !ttsActive} variant={ttsActive ? 'default' : 'outline'}>
                {ttsActive && !ttsPaused ? <><Pause className="h-3.5 w-3.5" /> Pause</> : ttsActive && ttsPaused ? <><Play className="h-3.5 w-3.5" /> Resume</> : <><Volume2 className="h-3.5 w-3.5" /> Read aloud</>}
              </Button>
              {ttsActive && (
                <Button size="sm" variant="ghost" onClick={stopTts}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              )}

              <Select value={ttsVoice} onValueChange={v => { setTtsVoice(v); localStorage.setItem('tts-voice', v); }}>
                <SelectTrigger className="h-8 w-auto gap-2 px-2 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTS_VOICES.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1">
                <Button size="icon-sm" variant="ghost" onClick={() => { const r = Math.max(0.5, ttsRate - 0.25); setTtsRate(r); localStorage.setItem('tts-rate', String(r)); if (audioRef.current) audioRef.current.playbackRate = r; }}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="min-w-[2.5rem] text-center text-xs tabular-nums text-muted-foreground">{ttsRate.toFixed(2)}×</span>
                <Button size="icon-sm" variant="ghost" onClick={() => { const r = Math.min(3, ttsRate + 0.25); setTtsRate(r); localStorage.setItem('tts-rate', String(r)); if (audioRef.current) audioRef.current.playbackRate = r; }}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {ttsLoading && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Generating…
                </span>
              )}
              {ttsActive && ttsProgress.total > 0 && !ttsLoading && (
                <span className="text-xs text-muted-foreground">
                  {ttsProgress.current}/{ttsProgress.total}
                  {ttsPauseReason === 'table' && ' · paused at table — press resume'}
                  {ttsPauseReason === 'image' && ' · paused at image — press resume'}
                </span>
              )}

              <audio ref={audioRef} className="hidden" />
            </div>

            {error && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Document body. PDFs render via PDF.js (visual fidelity +
                selectable text layer). DOCX/TXT render through the
                reader-prose container. */}
            {selectedDocument.fileType === 'pdf' ? (
              <div
                ref={docxViewerRef}
                onClick={handlePdfClick}
                className={cn(ttsActive && 'tts-active', 'cursor-text')}
              >
                {pdfObjectUrl ? (
                  <PdfViewer url={pdfObjectUrl} />
                ) : (
                  <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading PDF…
                  </div>
                )}
              </div>
            ) : (
              (docxHtml || editing) ? (
                <div className="space-y-2">
                  {editing && <EditorToolbar exec={execEditorCommand} />}
                  <div className="relative max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-card">
                    <div
                      ref={docxViewerRef}
                      className={cn(
                        'reader-prose p-4 sm:p-6 md:p-10',
                        ttsActive && 'tts-active',
                        editing && 'outline outline-1 outline-dashed outline-primary focus:outline-2',
                      )}
                      contentEditable={editing}
                      suppressContentEditableWarning
                      onKeyDown={editing ? handleEditorKeyDown : undefined}
                      onClick={editing ? undefined : handleDocxClick}
                      dangerouslySetInnerHTML={{ __html: docxHtml }}
                    />
                    {/* Shared-explanation margin bubbles (club docs), anchored to
                        each block by data-tts-index; scroll with the content. */}
                    {sharedBubbles.map(b => (
                      <button
                        key={b.blockIndex}
                        type="button"
                        onClick={() => setViewingShared(b.exps)}
                        style={{ top: b.top + 2 }}
                        title={`${b.exps.length} shared explanation${b.exps.length > 1 ? 's' : ''}`}
                        className="absolute right-1.5 inline-flex h-6 min-w-[1.5rem] items-center justify-center gap-0.5 rounded-full border border-border bg-card px-1.5 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <MessageSquare className="h-3 w-3 text-primary" />
                        {b.exps.length > 1 ? b.exps.length : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading document…
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Floating "Explain" button anchored to the user's text selection */}
      {selectionInfo && !explainOpen && (
        <button
          data-explain-button
          onMouseDown={e => e.preventDefault()}
          onClick={handleOpenExplain}
          style={{
            position: 'fixed',
            top: Math.max(8, selectionInfo.rect.top - 40),
            left: Math.max(8, Math.min(typeof window !== 'undefined' ? window.innerWidth - 110 : 800, selectionInfo.rect.left + selectionInfo.rect.width / 2 - 50)),
          }}
          className="z-40 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md transition-transform hover:scale-105"
        >
          <Sparkles className="h-3 w-3" /> Explain
        </button>
      )}

      {/* Welcome dialog */}

      <Dialog open={showWelcome} onOpenChange={open => { if (!open) dismissWelcome(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Welcome to ReadAura</DialogTitle>
            <DialogDescription>
              A local-first reader for PDFs, Word docs, and pasted text.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-2 text-sm">
            <li><strong>Upload</strong> — drop a PDF, DOCX, TXT, or Markdown file anywhere on the page, paste text, or click <em>Upload</em>.</li>
            <li><strong>Highlight</strong> — select any passage to get an AI explanation, with multi-turn follow-ups.</li>
            <li><strong>Read aloud</strong> — neural-voice TTS, click-to-jump, paragraph highlighting.</li>
          </ol>
          {!aiConfigured && (
            <p className="text-xs text-muted-foreground">
              AI explanations need a free NVIDIA API key. Get one at{' '}
              <a className="underline" href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer">build.nvidia.com</a>{' '}
              and paste it into Settings.
            </p>
          )}
          <DialogFooter className="sm:justify-between">
            {!aiConfigured ? (
              <Button
                variant="outline"
                onClick={() => { dismissWelcome(); setSettingsOpen(true); }}
              >
                Add API key
              </Button>
            ) : <span />}
            <Button onClick={dismissWelcome}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload dialog */}
      <Dialog open={showUpload} onOpenChange={open => { setShowUpload(open); if (!open) resetUploadForm(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add a document</DialogTitle>
            <DialogDescription>Upload a PDF, DOCX, TXT, or Markdown file — or paste text.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Source switcher */}
            <div role="group" aria-label="Document source" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
              <button
                type="button"
                aria-pressed={uploadTab === 'files'}
                onClick={() => setUploadTab('files')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  uploadTab === 'files' ? 'border-border bg-background text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Upload className="h-4 w-4" /> Upload files
              </button>
              <button
                type="button"
                aria-pressed={uploadTab === 'paste'}
                onClick={() => setUploadTab('paste')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  uploadTab === 'paste' ? 'border-border bg-background text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <ClipboardPaste className="h-4 w-4" /> Paste text
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Title <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                id="title"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                placeholder={uploadTitlePlaceholder}
              />
              <p className="text-xs text-muted-foreground">{uploadTitleHelp}</p>
            </div>

            <div className="space-y-1.5">
              <Label>Tags</Label>
              <TagInput value={uploadTags} onChange={setUploadTags} suggestions={allTags} placeholder="research, philosophy, biology…" />
            </div>

            {uploadTab === 'files' ? (
              <div className="space-y-1.5">
                <Label htmlFor="file">Files</Label>
                <Input
                  id="file"
                  ref={fileInputRef}
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  multiple
                  onChange={e => setUploadFiles(
                    Array.from(e.target.files || []).filter(f =>
                      ACCEPTED_EXTS.includes(f.name.split('.').pop()?.toLowerCase() ?? ''),
                    ),
                  )}
                  className="flex-1"
                />
                {uploadFiles.length > 0 && (
                  <p className="truncate text-xs text-muted-foreground">
                    {uploadFiles.length} file{uploadFiles.length === 1 ? '' : 's'} selected: {uploadFiles.map(f => f.name).join(', ')}
                  </p>
                )}
                <Button onClick={handleUploadFiles} disabled={uploading || uploadFiles.length === 0} className="w-full sm:w-auto">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload {uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''}
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="paste">Text</Label>
                <Textarea
                  id="paste"
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="Paste or write document text here…"
                  rows={8}
                />
                <Button
                  onClick={handlePasteUpload}
                  disabled={uploading || !pasteText.trim()}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Save text
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk tag editor dialog */}
      <BulkTagDialog
        open={bulkTagOpen}
        onClose={() => setBulkTagOpen(false)}
        selectedCount={bulkSelected.size}
        allTags={allTags}
        onApply={applyBulkTag}
      />

      {/* Settings dialog (also reachable from the Navbar) */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Explanations sheet (only when a doc is open) */}
      {selectedDocument && (
        <SavedExplanationsDrawer
          documentId={selectedDocument.id}
          refreshKey={explanationsRefreshKey}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onContinue={handleContinueExplanation}
          shared={sharedExps}
          onDeleted={handleExplanationDeleted}
        />
      )}

      {/* Read-only view of the shared explanations at a clicked margin bubble */}
      <Dialog open={!!viewingShared} onOpenChange={o => { if (!o) setViewingShared(null); }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Shared by the club</DialogTitle>
            <DialogDescription>Explanations other members shared on this passage.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {viewingShared?.map(s => (
              <div key={s.id} className="overflow-hidden rounded-md border border-border">
                <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs">
                  <span className="italic text-muted-foreground">&ldquo;{s.selectedText.length > 160 ? s.selectedText.slice(0, 160) + '…' : s.selectedText}&rdquo;</span>
                  <span className="ml-1.5 font-medium">— {s.authorName}</span>
                </div>
                <div className="space-y-3 p-3 text-sm">
                  {s.messages.map((m, i) => (
                    <div key={i}>
                      <div className={`mb-0.5 text-xs font-semibold uppercase tracking-wide ${m.role === 'assistant' ? 'text-primary' : 'text-muted-foreground'}`}>
                        {m.role === 'assistant' ? 'Aura' : s.authorName}
                      </div>
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Explanation popover */}
      {explainOpen && selectedDocument && (continueFromThread || activeSelection) && (
        <ExplainPopover
          documentId={selectedDocument.id}
          documentTitle={selectedDocument.title}
          selectedText={continueFromThread?.selectedText ?? activeSelection!.text}
          contextBefore={continueFromThread?.contextBefore ?? activeSelection!.contextBefore}
          contextAfter={continueFromThread?.contextAfter ?? activeSelection!.contextAfter}
          blockIndex={continueFromThread ? (continueFromThread.blockIndex ?? null) : (activeSelection?.blockTtsIndex ?? null)}
          canShareToClub={canShareToClub}
          initialMessages={continueInitialMessages}
          initialExplanationId={continueFromThread?.id ?? null}
          onClose={handleCloseExplain}
          onSaved={handleExplanationSaved}
        />
      )}
    </main>
  );
}

/* ===== Bulk tag editor ===== */
function BulkTagDialog({
  open, onClose, selectedCount, allTags, onApply,
}: {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  allTags: string[];
  onApply: (action: 'add' | 'remove', tag: string) => Promise<void>;
}) {
  const [tag, setTag] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (open) setTag(''); }, [open]);

  const apply = async (action: 'add' | 'remove') => {
    if (!tag.trim()) return;
    setBusy(true);
    try {
      await onApply(action, tag);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit tags on {selectedCount} document{selectedCount === 1 ? '' : 's'}</DialogTitle>
          <DialogDescription>Add or remove a tag from every selected document.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-tag">Tag</Label>
            <Input
              id="bulk-tag"
              value={tag}
              onChange={e => setTag(e.target.value)}
              placeholder="e.g. research"
            />
          </div>
          {allTags.length > 0 && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Existing tags</div>
              <div className="flex flex-wrap gap-1">
                {allTags.map(t => (
                  <Badge
                    key={t}
                    variant="secondary"
                    onClick={() => setTag(t)}
                    className="cursor-pointer"
                  >{t}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => apply('remove')} disabled={busy || !tag.trim()}>
            <Minus className="h-4 w-4" /> Remove from selected
          </Button>
          <Button onClick={() => apply('add')} disabled={busy || !tag.trim()}>
            <Plus className="h-4 w-4" /> Add to selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
