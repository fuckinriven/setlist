import { useState, useCallback, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './App.css'

const DEFAULT_SONGS = [
  { id: '1', title: 'Fist song', duration: 204, enabled: true },
  { id: '2', title: 'Slow one', duration: 241, enabled: false },
  { id: '3', title: 'Crowd favorite', duration: 278, enabled: true },
  { id: '4', title: 'Encore', duration: 246, enabled: true },
]

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function useLocalStorage(key, initialValue) {
  const [stored, setStored] = useState(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback((value) => {
    setStored((prev) => {
      const next = value instanceof Function ? value(prev) : value
      window.localStorage.setItem(key, JSON.stringify(next))
      return next
    })
  }, [key])

  return [stored, setValue]
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.round(totalSeconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function parseDuration(input) {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10)
    return n > 0 ? n : null
  }
  const parts = trimmed.split(':')
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10)
    const s = parseInt(parts[1], 10)
    if (!isNaN(m) && !isNaN(s) && m >= 0 && s >= 0 && s < 60) {
      const total = m * 60 + s
      return total > 0 ? total : null
    }
  }
  return null
}

function durationToString(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ── URL state encoding for sharing ── */

function encodeState(songs, gapTime) {
  const json = JSON.stringify({ s: songs, g: gapTime })
  // Encode as UTF-8 first so non-ASCII chars (Polish, etc.) survive btoa
  const utf8 = unescape(encodeURIComponent(json))
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeState(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  const utf8 = atob(base64)
  return JSON.parse(decodeURIComponent(escape(utf8)))
}

/* Try loading shared state from URL query param & save to localStorage */
function loadSharedState() {
  try {
    const params = new URLSearchParams(window.location.search)
    const encoded = params.get('d')
    if (!encoded) return
    const data = decodeState(encoded)
    if (data && Array.isArray(data.s)) {
      window.localStorage.setItem('setlist-songs', JSON.stringify(data.s))
      if (typeof data.g === 'number') {
        window.localStorage.setItem('setlist-gap', JSON.stringify(data.g))
      }
      // Clean the URL so subsequent refreshes use localStorage normally
      window.history.replaceState({}, '', window.location.pathname)
    }
  } catch {
    // Invalid data param — ignore
  }
}

loadSharedState()

function SortableSong({ song, onToggle, onDurationChange, onDelete, onTitleChange }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const [durationDraft, setDurationDraft] = useState(durationToString(song.duration))
  const [titleDraft, setTitleDraft] = useState(song.title)
  const [editingDuration, setEditingDuration] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)

  const commitDuration = () => {
    setEditingDuration(false)
    const parsed = parseDuration(durationDraft)
    if (parsed !== null) {
      onDurationChange(song.id, parsed)
    } else {
      setDurationDraft(durationToString(song.duration))
    }
  }

  const commitTitle = () => {
    setEditingTitle(false)
    if (titleDraft.trim()) {
      onTitleChange(song.id, titleDraft.trim())
    } else {
      setTitleDraft(song.title)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`song-item${song.enabled ? '' : ' disabled'}`}
    >
      <button className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="7" cy="5" r="1.5" />
          <circle cx="13" cy="5" r="1.5" />
          <circle cx="7" cy="10" r="1.5" />
          <circle cx="13" cy="10" r="1.5" />
          <circle cx="7" cy="15" r="1.5" />
          <circle cx="13" cy="15" r="1.5" />
        </svg>
      </button>

      <label className="toggle">
        <input
          type="checkbox"
          checked={song.enabled}
          onChange={() => onToggle(song.id)}
        />
        <span className="slider" />
      </label>

      <div className="song-info">
        {editingTitle ? (
          <input
            className="title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === 'Enter' && commitTitle()}
            autoFocus
          />
        ) : (
          <span
            className="song-title"
            onClick={() => { setTitleDraft(song.title); setEditingTitle(true) }}
          >
            {song.title}
          </span>
        )}
      </div>

      <div className="duration-control">
        {editingDuration ? (
          <input
            className="duration-input"
            value={durationDraft}
            onChange={(e) => setDurationDraft(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => e.key === 'Enter' && commitDuration()}
            autoFocus
          />
        ) : (
          <span
            className="duration-text"
            onClick={() => { setDurationDraft(durationToString(song.duration)); setEditingDuration(true) }}
          >
            {durationToString(song.duration)}
          </span>
        )}
      </div>

      <button className="delete-btn" onClick={() => onDelete(song)} aria-label="Delete song">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="4" x2="12" y2="12" />
          <line x1="12" y1="4" x2="4" y2="12" />
        </svg>
      </button>
    </div>
  )
}

function App() {
  const [songs, setSongs] = useLocalStorage('setlist-songs', DEFAULT_SONGS)
  const [gapTime, setGapTime] = useLocalStorage('setlist-gap', 40)
  const [newSongTitle, setNewSongTitle] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setSongs((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id)
        const newIndex = prev.findIndex((s) => s.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }, [setSongs])

  const handleToggle = useCallback((id) => {
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)))
  }, [setSongs])

  const handleDurationChange = useCallback((id, duration) => {
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, duration } : s)))
  }, [setSongs])

  const handleTitleChange = useCallback((id, title) => {
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)))
  }, [setSongs])

  const [pendingDelete, setPendingDelete] = useState(null)

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    setSongs((prev) => prev.filter((s) => s.id !== pendingDelete.id))
    setPendingDelete(null)
  }, [pendingDelete, setSongs])

  const cancelDelete = useCallback(() => {
    setPendingDelete(null)
  }, [])

  const handleDelete = useCallback((song) => {
    setPendingDelete(song)
  }, [])

  const handleAdd = useCallback(() => {
    const title = newSongTitle.trim()
    if (!title) return
    setSongs((prev) => [
      ...prev,
      { id: generateId(), title, duration: 180, enabled: true },
    ])
    setNewSongTitle('')
  }, [newSongTitle, setSongs])

  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const handleShare = useCallback(async () => {
    const data = encodeState(songs, gapTime)
    const url = `${window.location.origin}${window.location.pathname}?d=${data}`

    // Try native share on mobile
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Setlist', url })
        return
      } catch {
        // User cancelled or API unavailable
      }
    }

    // Fallback: copy link to clipboard
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      // Clipboard not available
    }
  }, [songs, gapTime])

  const handleCopy = useCallback(async () => {
    const enabled = songs.filter((s) => s.enabled)
    if (enabled.length === 0) return
    const text = enabled.map((s, i) => `${i + 1}. ${s.title}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard not available
    }
  }, [songs])

  const enabledCount = useMemo(() => songs.filter((s) => s.enabled).length, [songs])

  const totalTime = useMemo(() => {
    const enabled = songs.filter((s) => s.enabled)
    const songTime = enabled.reduce((sum, s) => sum + s.duration, 0)
    const gaps = Math.max(0, enabled.length - 1)
    return songTime + gaps * gapTime
  }, [songs, gapTime])

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Setlist</h1>
          <p className="subtitle">{enabledCount} of {songs.length} songs</p>
        </div>
        <div className="total-time">
          <span className="total-label">total</span>
          <span className="total-value">{formatTime(totalTime)}</span>
        </div>
      </header>

      <section className="settings-card">
        <div className="setting-row">
          <span className="setting-label">Gap between songs</span>
          <div className="stepper">
            <button onClick={() => setGapTime((g) => Math.max(0, g - 5))} aria-label="Decrease gap">−</button>
            <span className="stepper-value">{gapTime}s</span>
            <button onClick={() => setGapTime((g) => g + 5)} aria-label="Increase gap">+</button>
          </div>
        </div>
        <div className="setting-row">
          <span className="setting-label">Gaps count</span>
          <span className="setting-value">{Math.max(0, enabledCount - 1)}</span>
        </div>
      </section>

      <section className="add-section">
        <input
          className="add-input"
          placeholder="Add a song..."
          value={newSongTitle}
          onChange={(e) => setNewSongTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="add-btn" onClick={handleAdd} disabled={!newSongTitle.trim()}>
          Add
        </button>
      </section>

      <div className="toolbar">
        <button
          className="share-btn"
          onClick={handleShare}
        >
          {linkCopied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 7 6 10 11 4" />
              </svg>
              Link copied!
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 5.5a2.5 2.5 0 1 1 2-1.2" />
                <path d="M9 8.5a2.5 2.5 0 1 1-2 1.2" />
                <line x1="8" y1="7" x2="6.5" y2="6" />
                <line x1="8" y1="7" x2="6.5" y2="8" />
              </svg>
              Share link
            </>
          )}
        </button>
        <button
          className="copy-btn"
          onClick={handleCopy}
          disabled={enabledCount === 0}
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 7 6 10 11 4" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="1" width="9" height="10" rx="1.5" />
                <path d="M11 4h1.5A1.5 1.5 0 0 1 14 5.5v6a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 5 11.5V10" />
              </svg>
              Copy setlist
            </>
          )}
        </button>
      </div>

      <section className="song-list">
        {songs.length === 0 ? (
          <div className="empty-state">
            <p>No songs yet</p>
            <p className="empty-hint">Add one above to get started</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={songs.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {songs.map((song) => (
                <SortableSong
                  key={song.id}
                  song={song}
                  onToggle={handleToggle}
                  onDurationChange={handleDurationChange}
                  onDelete={handleDelete}
                  onTitleChange={handleTitleChange}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </section>

      {pendingDelete && (
        <div className="overlay" onClick={cancelDelete}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-text">
              Delete <strong>{pendingDelete.title}</strong>?
            </p>
            <div className="confirm-actions">
              <button className="confirm-btn cancel" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="confirm-btn delete" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <span>{formatTime(totalTime)} total</span>
        <span className="footer-gap">{gapTime}s gap</span>
      </footer>
    </div>
  )
}

export default App
