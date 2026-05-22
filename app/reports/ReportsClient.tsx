'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { UIMessage } from 'ai';
import type { Document, SavedExplanation } from '@/lib/db';
import { fetchDocuments, removeDocument, editDocument } from './actions';
import ExplainPopover from './ExplainPopover';
import SavedExplanationsDrawer from './SavedExplanationsDrawer';

const TTS_VOICES = [
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava (F)' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma (F)' },
  { id: 'en-US-BrianMultilingualNeural', label: 'Brian (M)' },
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew (M)' },
  { id: 'en-US-RogerNeural', label: 'Roger (M)' },
  { id: 'en-GB-RyanNeural', label: 'Ryan (UK, M)' },
] as const;

const WELCOME_SEEN_KEY = 'readaura-welcome-seen';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  initialDocuments: Document[];
  aiConfigured: boolean;
};

export default function ReportsClient({ initialDocuments, aiConfigured }: Props) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [docxHtml, setDocxHtml] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [txtEditing, setTxtEditing] = useState(false);
  const [txtEditContent, setTxtEditContent] = useState('');
  const [txtSaving, setTxtSaving] = useState(false);
  const [docxEditing, setDocxEditing] = useState(false);
  const [docxSaving, setDocxSaving] = useState(false);

  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(WELCOME_SEEN_KEY)) setShowWelcome(true);
  }, []);
  const dismissWelcome = () => {
    if (typeof window !== 'undefined') localStorage.setItem(WELCOME_SEEN_KEY, '1');
    setShowWelcome(false);
  };

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
  type TtsItem = { type: 'text'; text: string; element: Element | null }
    | { type: 'table' | 'image'; text: ''; element: Element | null };
  const ttsItemsRef = useRef<TtsItem[]>([]);
  const ttsIndexRef = useRef(0);
  const ttsCancelledRef = useRef(false);
  const ttsGenRef = useRef(0);
  const [ttsProgress, setTtsProgress] = useState({ current: 0, total: 0 });
  const [ttsPauseReason, setTtsPauseReason] = useState<'table' | 'image' | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const docxViewerRef = useRef<HTMLDivElement>(null);

  type SelectionInfo = {
    text: string;
    contextBefore: string;
    contextAfter: string;
    rect: { top: number; left: number; width: number };
  };
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [activeSelection, setActiveSelection] = useState<SelectionInfo | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [continueFromThread, setContinueFromThread] = useState<SavedExplanation | null>(null);
  const [explanationsRefreshKey, setExplanationsRefreshKey] = useState(0);

  useEffect(() => {
    const viewer = docxViewerRef.current;
    if (!viewer || docxEditing) return;

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

        setSelectionInfo({
          text,
          contextBefore,
          contextAfter,
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
  }, [docxEditing, docxHtml]);

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
  };

  const handleCloseExplain = () => {
    setExplainOpen(false);
    setContinueFromThread(null);
    setActiveSelection(null);
    setSelectionInfo(null);
  };

  const handleExplanationSaved = () => {
    setExplanationsRefreshKey(k => k + 1);
  };

  const continueInitialMessages: UIMessage[] | undefined = continueFromThread
    ? continueFromThread.messages.map((m): UIMessage => ({
        id: m.id,
        role: m.role,
        parts: [{ type: 'text', text: m.content }],
      }))
    : undefined;

  const [ttsHighlightIndex, setTtsHighlightIndex] = useState(-1);
  const ttsHighlightRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (ttsHighlightRef.current) {
      ttsHighlightRef.current.style.background = '';
      ttsHighlightRef.current.style.borderLeft = '';
      ttsHighlightRef.current.style.paddingLeft = '';
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
      target.style.background = 'rgba(51, 255, 0, 0.12)';
      target.style.borderLeft = '2px solid var(--term-fg)';
      target.style.paddingLeft = '0.5rem';
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      ttsHighlightRef.current = target;
    }
  }, [ttsHighlightIndex, docxHtml]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const emptyStateFileRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const tagsInputRef = useRef<HTMLInputElement>(null);
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);

  const handleUpload = async (droppedFiles?: File[]) => {
    const fromForm = fileInputRef.current?.files ? Array.from(fileInputRef.current.files) : [];
    const fromEmpty = emptyStateFileRef.current?.files ? Array.from(emptyStateFileRef.current.files) : [];
    const fileList = droppedFiles || (fromForm.length > 0 ? fromForm : fromEmpty);
    const titleInput = titleInputRef.current?.value?.trim();
    const tagsStr = tagsInputRef.current?.value || '';

    if (fileList.length === 0) {
      setError('Please select at least one file.');
      return;
    }

    const files = fileList;

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'pdf' && ext !== 'docx') {
        setError(`"${file.name}" is not a PDF or DOCX file.`);
        return;
      }
    }

    setUploading(true);
    setError('');
    const errors: string[] = [];

    for (const file of files) {
      const title = files.length === 1 && titleInput
        ? titleInput
        : titleInput
          ? `${titleInput} - ${file.name.replace(/\.[^.]+$/, '')}`
          : file.name.replace(/\.[^.]+$/, '');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('tags', tagsStr);

      try {
        const res = await fetch('/api/reports/upload', { method: 'POST', body: formData });
        if (!res.ok) {
          const data = await res.json();
          errors.push(`${file.name}: ${data.error || 'failed'}`);
        }
      } catch {
        errors.push(`${file.name}: upload failed`);
      }
    }

    if (errors.length > 0) {
      setError(errors.join('; '));
    }

    const updated = await fetchDocuments();
    setDocuments(updated);
    if (errors.length === 0) {
      setShowUpload(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (emptyStateFileRef.current) emptyStateFileRef.current.value = '';
    if (titleInputRef.current) titleInputRef.current.value = '';
    if (tagsInputRef.current) tagsInputRef.current.value = '';
    setUploading(false);
    setDragOver(false);
  };

  const handleTxtEdit = async () => {
    if (!selectedDocument) return;
    if (!txtEditing) {
      try {
        const res = await fetch(`/api/reports/${selectedDocument.id}/text`);
        const data = await res.json();
        setTxtEditContent(data.text || '');
        setTxtEditing(true);
        stopTts();
      } catch {
        setError('Failed to load text for editing.');
      }
      return;
    }
    setTxtSaving(true);
    try {
      const res = await fetch(`/api/reports/${selectedDocument.id}/update-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txtEditContent }),
      });
      if (!res.ok) { setError('Failed to save.'); return; }
      const rawHtml = txtEditContent.split(/\n\s*\n/).filter(p => p.trim()).map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`).join('');
      const { html, items } = processDocxHtml(rawHtml);
      setDocxHtml(html);
      ttsItemsRef.current = items;
      setTxtEditing(false);
    } catch {
      setError('Failed to save.');
    }
    setTxtSaving(false);
  };

  const handleDocxEdit = async () => {
    if (!selectedDocument || !docxViewerRef.current) return;
    if (!docxEditing) {
      setDocxEditing(true);
      stopTts();
      return;
    }
    setDocxSaving(true);
    try {
      const editedHtml = docxViewerRef.current.innerHTML;
      const res = await fetch(`/api/reports/${selectedDocument.id}/html`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: editedHtml }),
      });
      if (!res.ok) { setError('Failed to save.'); return; }
      const { html, items } = processDocxHtml(editedHtml);
      setDocxHtml(html);
      ttsItemsRef.current = items;
      setDocxEditing(false);
    } catch {
      setError('Failed to save.');
    }
    setDocxSaving(false);
  };

  const handlePasteUpload = async () => {
    const text = pasteInputRef.current?.value?.trim();
    const title = titleInputRef.current?.value?.trim();
    const tagsStr = tagsInputRef.current?.value || '';
    if (!text) { setError('Please paste some text.'); return; }
    if (!title) { setError('Please provide a title for pasted text.'); return; }
    setUploading(true);
    setError('');
    try {
      const res = await fetch('/api/reports/upload-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, text, tags: tagsStr }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Upload failed');
      } else {
        const updated = await fetchDocuments();
        setDocuments(updated);
        setShowUpload(false);
        if (pasteInputRef.current) pasteInputRef.current.value = '';
        if (titleInputRef.current) titleInputRef.current.value = '';
        if (tagsInputRef.current) tagsInputRef.current.value = '';
      }
    } catch {
      setError('Upload failed.');
    }
    setUploading(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext === 'pdf' || ext === 'docx';
    });
    if (droppedFiles.length === 0) {
      setError('Only PDF and DOCX files are allowed.');
      return;
    }
    setShowUpload(true);
    handleUpload(droppedFiles);
  };

  const handleDelete = async (documentId: string) => {
    const res = await removeDocument(documentId);
    if (res.ok) {
      setDocuments(prev => prev.filter(r => r.id !== documentId));
      if (selectedDocument?.id === documentId) {
        setSelectedDocument(null);
        setDocxHtml('');
        stopTts();
      }
    }
  };

  const startEdit = (r: Document) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditTags(r.tags.map(t => t.replace(/[\[\]]/g, '')).join(', '));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditTags('');
  };

  const saveEdit = async () => {
    if (!editingId || !editTitle.trim()) return;
    const tags = editTags.split(',').map(t => t.trim().toLowerCase().replace(/[\[\]]/g, '')).filter(Boolean);
    const res = await editDocument(editingId, editTitle.trim(), tags);
    if (res.ok) {
      setDocuments(prev => prev.map(r =>
        r.id === editingId ? { ...r, title: editTitle.trim(), tags } : r
      ));
      if (selectedDocument?.id === editingId) {
        setSelectedDocument(prev => prev ? { ...prev, title: editTitle.trim(), tags } : prev);
      }
    }
    cancelEdit();
  };

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
    const allEls = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, table');

    for (const el of allEls) {
      const tag = el.tagName.toLowerCase();
      if (tag !== 'table' && el.closest('table')) continue;

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

    const html = container.innerHTML;
    return { html, items };
  }, []);

  const handleView = async (doc: Document) => {
    stopTts();
    setSelectedDocument(doc);
    setExpanded(true);
    setDocxHtml('');
    ttsItemsRef.current = [];

    if (doc.fileType === 'docx') {
      try {
        const res = await fetch(`/api/reports/${doc.id}/html`);
        const data = await res.json();
        const rawHtml = data.html || '';
        const { html, items } = processDocxHtml(rawHtml);
        setDocxHtml(html);
        ttsItemsRef.current = items;
      } catch {
        setDocxHtml('<p>Failed to load document.</p>');
      }
    } else if (doc.fileType === 'txt') {
      try {
        const res = await fetch(`/api/reports/${doc.id}/text`);
        const data = await res.json();
        const text = data.text || '';
        const rawHtml = text.split(/\n\s*\n/).filter((p: string) => p.trim()).map((p: string) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`).join('');
        const { html, items } = processDocxHtml(rawHtml);
        setDocxHtml(html);
        ttsItemsRef.current = items;
      } catch {
        setDocxHtml('<p>Failed to load text.</p>');
      }
    }
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
      if (selectedDocument.fileType === 'docx' || selectedDocument.fileType === 'txt') {
        if (ttsItemsRef.current.length === 0) {
          setError('No content found to read.');
          return;
        }
      } else {
        const res = await fetch(`/api/reports/${selectedDocument.id}/text`);
        const data = await res.json();
        const text = data.text || '';
        if (!text.trim()) {
          setError('No text could be extracted from this document.');
          return;
        }
        const paras = text.split(/\n\s*\n/).filter((p: string) => p.trim().length > 0);
        ttsItemsRef.current = paras.map((p: string) => ({ type: 'text' as const, text: p.trim(), element: null }));
      }

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
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return;
    }

    const target = e.target as HTMLElement;
    const tagged = target.closest('[data-tts-index]') as HTMLElement | null;
    if (!tagged) return;

    const itemIndex = parseInt(tagged.getAttribute('data-tts-index') || '', 10);
    if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= ttsItemsRef.current.length) return;
    ttsGenRef.current++;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setTtsPaused(false);
    setTtsPauseReason(null);

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
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      cache.clear();
    };
  }, []);

  const allTags = Array.from(new Set(documents.flatMap(r => r.tags)));
  const displayed = filterTag ? documents.filter(r => r.tags.includes(filterTag)) : documents;
  const libraryIsEmpty = documents.length === 0;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: 'relative' }}
    >
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(51, 255, 0, 0.08)',
          border: '3px dashed var(--term-fg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem', color: 'var(--term-fg)',
          pointerEvents: 'none',
        }}>
          DROP PDF / DOCX FILES HERE
        </div>
      )}

      {/* Welcome modal (first run) */}
      {showWelcome && (
        <div
          className="modal-backdrop"
          onClick={dismissWelcome}
          role="dialog"
          aria-label="Welcome to ReadAura"
        >
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>&gt; WELCOME TO READAURA</h2>
            <p style={{ marginBottom: '1rem' }}>
              A local-first reader for PDFs, Word docs, and pasted text. Three things to try:
            </p>
            <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.7, marginBottom: '1rem' }}>
              <li><strong>Upload</strong> — drop a PDF or DOCX anywhere on this page, or use UPLOAD DOCUMENT.</li>
              <li><strong>Highlight</strong> — select any passage in the viewer to get an AI explanation, with multi-turn follow-ups.</li>
              <li><strong>Read aloud</strong> — press READ ALOUD for neural-voice TTS, with click-to-jump and paragraph highlighting.</li>
            </ol>
            {!aiConfigured && (
              <p style={{ fontSize: '0.85rem', color: 'var(--term-alert)', marginBottom: '1rem' }}>
                Heads up: AI explanations need an <code>NVIDIA_API_KEY</code> in your <code>.env.local</code>. Get a free one at <a href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer">build.nvidia.com</a>.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={dismissWelcome}>GOT IT</button>
            </div>
          </div>
        </div>
      )}

      {!expanded && (
        <h2 style={{ marginBottom: '1rem' }}>&gt; LIBRARY</h2>
      )}

      {/* Missing API key banner */}
      {!expanded && !aiConfigured && (
        <div
          className="card"
          style={{
            borderColor: 'var(--term-alert)',
            color: 'var(--term-alert)',
            marginBottom: '1rem',
            fontSize: '0.85rem',
          }}
        >
          <strong>⚠ AI EXPLANATIONS DISABLED.</strong> Set <code>NVIDIA_API_KEY</code> in <code>.env.local</code> to enable highlight-to-explain. Get a free key at{' '}
          <a href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--term-alert)', borderBottomColor: 'var(--term-alert)' }}>
            build.nvidia.com
          </a>. Uploading, reading, and TTS work without it.
        </div>
      )}

      {/* Top action bar */}
      {!expanded && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="form-row" style={{ marginBottom: showUpload ? '0.75rem' : 0 }}>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setShowUpload(v => !v)}
              style={{
                fontSize: '0.85rem',
                background: showUpload ? 'var(--term-fg)' : 'transparent',
                color: showUpload ? 'var(--term-bg)' : 'var(--term-fg)',
              }}
            >UPLOAD DOCUMENT</button>
          </div>

          {showUpload && (
            <div style={{ borderTop: '1px dashed var(--term-dim)', paddingTop: '0.75rem' }}>
              <div className="form-row" style={{ marginBottom: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--term-dim)' }}>&gt; TITLE (optional for multi-upload):</label>
                  <input ref={titleInputRef} placeholder="Document title..." style={{ width: '100%' }} />
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--term-dim)' }}>&gt; TAGS (comma-separated):</label>
                  <input ref={tagsInputRef} placeholder="research, philosophy, biology..." style={{ width: '100%' }} />
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: '0.5rem', alignItems: 'center' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  multiple
                  style={{ flex: 1, fontSize: '0.85rem' }}
                />
                <button onClick={() => handleUpload()} disabled={uploading}>
                  {uploading ? 'UPLOADING...' : 'UPLOAD FILE'}
                </button>
              </div>
              <div style={{ borderTop: '1px dashed var(--term-dim)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--term-dim)' }}>&gt; OR PASTE TEXT:</label>
                <textarea
                  ref={pasteInputRef}
                  placeholder="Paste document text here..."
                  rows={4}
                  style={{ width: '100%', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', background: 'var(--term-bg)', color: 'var(--term-fg)', border: '1px solid var(--term-dim)', padding: '0.5rem', resize: 'vertical' }}
                />
                <button onClick={handlePasteUpload} disabled={uploading} style={{ marginTop: '0.3rem' }}>
                  {uploading ? 'UPLOADING...' : 'SAVE TEXT'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--term-alert)', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          ERROR: {error}
        </div>
      )}

      {/* Tags filter */}
      {!expanded && allTags.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button
            onClick={() => setFilterTag(null)}
            style={{
              padding: '0.15rem 0.5rem', fontSize: '0.8rem',
              background: !filterTag ? 'var(--term-fg)' : 'transparent',
              color: !filterTag ? 'var(--term-bg)' : 'var(--term-dim)',
            }}
          >ALL</button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setFilterTag(tag === filterTag ? null : tag)}
              style={{
                padding: '0.15rem 0.5rem', fontSize: '0.8rem',
                background: filterTag === tag ? 'var(--term-fg)' : 'transparent',
                color: filterTag === tag ? 'var(--term-bg)' : 'var(--term-dim)',
              }}
            >{tag}</button>
          ))}
        </div>
      )}

      {/* Empty state — shown when library has zero documents */}
      {!expanded && libraryIsEmpty && (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '2.5rem 1.5rem',
            borderStyle: 'dashed',
            borderColor: 'var(--term-dim)',
          }}
        >
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>&gt; LIBRARY IS EMPTY</div>
          <div style={{ color: 'var(--term-dim)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Drop your first PDF or DOCX anywhere on this page, or choose a file below.
          </div>
          <button onClick={() => emptyStateFileRef.current?.click()} style={{ fontSize: '0.9rem' }}>
            CHOOSE FILE
          </button>
          <input
            ref={emptyStateFileRef}
            type="file"
            accept=".pdf,.docx"
            multiple
            style={{ display: 'none' }}
            onChange={() => handleUpload()}
          />
        </div>
      )}

      {/* Documents table */}
      {!expanded && !libraryIsEmpty && (
        <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
          <table style={{ width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>TITLE</th>
                <th style={{ textAlign: 'left' }}>TYPE</th>
                <th style={{ textAlign: 'left' }} className="hide-mobile">TAGS</th>
                <th style={{ textAlign: 'left' }} className="hide-mobile">DATE</th>
                <th style={{ textAlign: 'left' }} className="hide-mobile">SIZE</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--term-dim)', padding: '2rem' }}>
                    No documents match this tag.
                  </td>
                </tr>
              ) : displayed.map(r => (
                <tr
                  key={r.id}
                  style={{
                    cursor: editingId === r.id ? 'default' : 'pointer',
                    background: selectedDocument?.id === r.id ? 'rgba(51, 255, 0, 0.1)' : undefined,
                  }}
                  onClick={() => { if (editingId !== r.id) handleView(r); }}
                >
                  {editingId === r.id ? (
                    <>
                      <td>
                        <input
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          style={{ width: '100%', fontSize: '0.85rem' }}
                          autoFocus
                        />
                      </td>
                      <td>{r.fileType.toUpperCase()}</td>
                      <td className="hide-mobile">
                        <input
                          value={editTags}
                          onChange={e => setEditTags(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          placeholder="tag1, tag2..."
                          style={{ width: '100%', fontSize: '0.85rem' }}
                        />
                      </td>
                      <td className="hide-mobile">{r.createdAt.slice(0, 10)}</td>
                      <td className="hide-mobile">{formatFileSize(r.fileSize)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                          style={{ fontSize: '0.75rem', marginRight: '0.3rem' }}
                        >SAVE</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                          style={{ fontSize: '0.75rem' }}
                        >CANCEL</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{r.title}</strong></td>
                      <td>{r.fileType.toUpperCase()}</td>
                      <td className="hide-mobile" style={{ color: 'var(--term-dim)' }}>
                        {r.tags.join(', ')}
                      </td>
                      <td className="hide-mobile">{r.createdAt.slice(0, 10)}</td>
                      <td className="hide-mobile">{formatFileSize(r.fileSize)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleView(r); }}
                          style={{ fontSize: '0.75rem', marginRight: '0.3rem' }}
                        >VIEW</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(r); }}
                          style={{ fontSize: '0.75rem', marginRight: '0.3rem' }}
                        >EDIT</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                          style={{ fontSize: '0.75rem', color: 'var(--term-alert)' }}
                        >DEL</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Document viewer */}
      {selectedDocument && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4>{selectedDocument.title}</h4>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {selectedDocument.fileType === 'txt' && (
                <button
                  onClick={handleTxtEdit}
                  disabled={txtSaving}
                  style={{ fontSize: '0.85rem' }}
                >{txtSaving ? 'SAVING...' : txtEditing ? 'SAVE' : 'EDIT'}</button>
              )}
              {txtEditing && (
                <button onClick={() => setTxtEditing(false)} style={{ fontSize: '0.85rem', color: 'var(--term-dim)' }}>CANCEL</button>
              )}
              {selectedDocument.fileType === 'docx' && (
                <button
                  onClick={handleDocxEdit}
                  disabled={docxSaving}
                  style={{ fontSize: '0.85rem' }}
                >{docxSaving ? 'SAVING...' : docxEditing ? 'SAVE' : 'EDIT'}</button>
              )}
              {docxEditing && (
                <button onClick={() => setDocxEditing(false)} style={{ fontSize: '0.85rem', color: 'var(--term-dim)' }}>CANCEL</button>
              )}
              <button onClick={() => { setSelectedDocument(null); setDocxHtml(''); stopTts(); setExpanded(false); setTxtEditing(false); setDocxEditing(false); }} style={{ fontSize: '0.85rem' }}>BACK</button>
            </div>
          </div>

          {/* TTS controls */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleReadAloud}
              disabled={ttsLoading && !ttsActive}
              style={{
                fontSize: '0.85rem',
                background: ttsActive ? 'var(--term-fg)' : 'transparent',
                color: ttsActive ? 'var(--term-bg)' : 'var(--term-fg)',
              }}
            >{ttsActive && !ttsPaused ? 'PAUSE' : ttsActive && ttsPaused ? 'RESUME' : 'READ ALOUD'}</button>
            {ttsActive && (
              <button onClick={stopTts} style={{ fontSize: '0.85rem', color: 'var(--term-alert)' }}>STOP</button>
            )}
            <select
              value={ttsVoice}
              onChange={e => { setTtsVoice(e.target.value); localStorage.setItem('tts-voice', e.target.value); }}
              style={{
                fontSize: '0.8rem',
                background: 'var(--term-bg)',
                color: 'var(--term-fg)',
                border: '1px solid var(--term-dim)',
                padding: '0.2rem 0.4rem',
              }}
            >
              {TTS_VOICES.map(v => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <button
                onClick={() => { const r = Math.max(0.5, ttsRate - 0.25); setTtsRate(r); localStorage.setItem('tts-rate', String(r)); if (audioRef.current) audioRef.current.playbackRate = r; }}
                style={{ fontSize: '0.8rem', padding: '0.1rem 0.4rem' }}
                title="Slow down"
              >-</button>
              <span style={{ fontSize: '0.75rem', color: 'var(--term-dim)', minWidth: '2.5rem', textAlign: 'center' }}>{ttsRate.toFixed(2)}x</span>
              <button
                onClick={() => { const r = Math.min(3, ttsRate + 0.25); setTtsRate(r); localStorage.setItem('tts-rate', String(r)); if (audioRef.current) audioRef.current.playbackRate = r; }}
                style={{ fontSize: '0.8rem', padding: '0.1rem 0.4rem' }}
                title="Speed up"
              >+</button>
            </div>
            {ttsLoading && (
              <span className="flash" style={{ fontSize: '0.75rem', color: 'var(--term-dim)' }}>
                GENERATING AUDIO...
              </span>
            )}
            {ttsActive && ttsProgress.total > 0 && !ttsLoading && (
              <span style={{ fontSize: '0.75rem', color: 'var(--term-dim)' }}>
                PARAGRAPH {ttsProgress.current}/{ttsProgress.total}
                {ttsPauseReason === 'table' && ' | PAUSED AT TABLE — PRESS RESUME TO CONTINUE'}
                {ttsPauseReason === 'image' && ' | PAUSED AT IMAGE — PRESS RESUME TO CONTINUE'}
                {!ttsPaused && (selectedDocument?.fileType === 'docx' || selectedDocument?.fileType === 'txt') && ' | CLICK TEXT TO JUMP'}
              </span>
            )}
          </div>
          {/* Hidden audio element for Edge TTS playback */}
          <audio ref={audioRef} style={{ display: 'none' }} />

          {/* PDF viewer */}
          {selectedDocument.fileType === 'pdf' && (
            <iframe
              src={`/api/reports/${selectedDocument.id}/file`}
              style={{
                width: '100%',
                height: expanded ? '85vh' : '70vh',
                border: '2px solid var(--term-fg)',
                background: '#fff',
              }}
              title={selectedDocument.title}
            />
          )}

          {/* DOCX / TXT content area */}
          {(selectedDocument.fileType === 'docx' || selectedDocument.fileType === 'txt') && (
            txtEditing ? (
              <textarea
                value={txtEditContent}
                onChange={e => setTxtEditContent(e.target.value)}
                style={{
                  width: '100%',
                  height: expanded ? '85vh' : '70vh',
                  padding: '1rem',
                  border: '2px solid var(--term-fg)',
                  background: 'var(--term-bg)',
                  color: 'var(--term-fg)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  resize: 'vertical',
                }}
              />
            ) : docxHtml ? (
              <div
                ref={docxViewerRef}
                className={`docx-viewer${ttsActive ? ' tts-active' : ''}`}
                contentEditable={docxEditing}
                suppressContentEditableWarning={docxEditing}
                onClick={docxEditing ? undefined : handleDocxClick}
                style={{
                  padding: '1rem',
                  border: `2px solid ${docxEditing ? 'var(--term-accent, #33ff00)' : 'var(--term-fg)'}`,
                  maxHeight: expanded ? '85vh' : '70vh',
                  overflowY: 'auto',
                  background: 'var(--term-bg)',
                  color: 'var(--term-fg)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  cursor: docxEditing ? 'text' : ttsActive ? 'pointer' : 'default',
                  outline: docxEditing ? '1px dashed var(--term-dim)' : 'none',
                }}
                dangerouslySetInnerHTML={{ __html: docxHtml }}
              />
            ) : (
              <div className="flash" style={{ textAlign: 'center', padding: '2rem' }}>
                LOADING DOCUMENT...
              </div>
            )
          )}

          {/* Saved AI Explanations drawer */}
          {selectedDocument && docxHtml && !docxEditing && (
            <SavedExplanationsDrawer
              documentId={selectedDocument.id}
              refreshKey={explanationsRefreshKey}
              onContinue={handleContinueExplanation}
            />
          )}
        </div>
      )}

      {/* Floating "Explain" button anchored to the user's text selection */}
      {selectionInfo && !explainOpen && (
        <button
          data-explain-button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleOpenExplain}
          style={{
            position: 'fixed',
            top: Math.max(8, selectionInfo.rect.top - 38),
            left: Math.max(8, Math.min(window.innerWidth - 110, selectionInfo.rect.left + selectionInfo.rect.width / 2 - 50)),
            zIndex: 9997,
            padding: '0.3rem 0.6rem',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            background: 'var(--term-bg)',
            color: 'var(--term-fg)',
            border: '1px solid var(--term-fg)',
            cursor: 'pointer',
          }}
        >
          ✨ Explain
        </button>
      )}

      {/* Explanation popover */}
      {explainOpen && selectedDocument && (continueFromThread || activeSelection) && (
        <ExplainPopover
          documentId={selectedDocument.id}
          documentTitle={selectedDocument.title}
          selectedText={continueFromThread?.selectedText ?? activeSelection!.text}
          contextBefore={continueFromThread?.contextBefore ?? activeSelection!.contextBefore}
          contextAfter={continueFromThread?.contextAfter ?? activeSelection!.contextAfter}
          initialMessages={continueInitialMessages}
          initialExplanationId={continueFromThread?.id ?? null}
          onClose={handleCloseExplain}
          onSaved={handleExplanationSaved}
        />
      )}
    </div>
  );
}
