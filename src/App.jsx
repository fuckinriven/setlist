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
  { id: '1', title: 'Intro', duration: 90, enabled: true },
  { id: '2', title: 'First Song', duration: 245, enabled: true },
  { id: '3', title: 'Second Song', duration: 210, enabled: true },
  { id: '4', title: 'Slow One', duration: 280, enabled: true },
  { id: '5', title: 'Crowd Favorite', duration: 195, enabled: true },
  { id: '6', title: 'Encore', duration: 300, enabled: false },
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

      <button className="delete-btn" onClick={() => onDelete(song.id)} aria-label="Delete song">
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

  const handleDelete = useCallback((id) => {
    setSongs((prev) => prev.filter((s) => s.id !== id))
  }, [setSongs])

  const handleAdd = useCallback(() => {
    const title = newSongTitle.trim()
    if (!title) return
    setSongs((prev) => [
      ...prev,
      { id: generateId(), title, duration: 180, enabled: true },
    ])
    setNewSongTitle('')
  }, [newSongTitle, setSongs])

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

      <footer className="footer">
        <span>{formatTime(totalTime)} total</span>
        <span className="footer-gap">{gapTime}s gap</span>
      </footer>
    </div>
  )
}

export default App
