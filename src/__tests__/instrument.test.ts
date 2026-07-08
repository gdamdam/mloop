import { describe, it, expect, vi } from "vitest"
import { noteToSemitones, keyIndexToNote, INSTRUMENT_BASE_NOTE } from "../engine/instrument/instrumentMapping"
import { VoiceAllocator } from "../engine/instrument/VoiceAllocator"

describe("noteToSemitones", () => {
  it("returns raw offset from root when scale is off", () => {
    expect(noteToSemitones(60, 60, "off", "snap")).toBe(0)
    expect(noteToSemitones(72, 60, "off", "snap")).toBe(12)
    expect(noteToSemitones(53, 60, "off", "snap")).toBe(-7)
  })

  it("passes in-scale notes through unchanged", () => {
    // major degrees above C
    expect(noteToSemitones(62, 60, "major", "snap")).toBe(2) // D
    expect(noteToSemitones(67, 60, "major", "snap")).toBe(7) // G
  })

  it("snaps out-of-scale notes to the nearest degree in snap mode", () => {
    expect(noteToSemitones(61, 60, "major", "snap")).toBe(0) // C# → C
    expect(noteToSemitones(66, 60, "major", "snap")).toBe(5) // F# → F
  })

  it("mutes out-of-scale notes in mute mode", () => {
    expect(noteToSemitones(61, 60, "major", "mute")).toBeNull() // C# muted
    expect(noteToSemitones(62, 60, "major", "mute")).toBe(2) // D still plays
  })

  it("respects a non-default root", () => {
    // root = 62 (D), minor scale relative to D
    expect(noteToSemitones(62, 62, "minor", "snap")).toBe(0)
    expect(noteToSemitones(65, 62, "minor", "snap")).toBe(3) // F is minor 3rd
  })

  it("keyIndexToNote anchors to the base note", () => {
    expect(keyIndexToNote(0)).toBe(INSTRUMENT_BASE_NOTE)
    expect(keyIndexToNote(7)).toBe(INSTRUMENT_BASE_NOTE + 7)
    expect(keyIndexToNote(0, 1)).toBe(INSTRUMENT_BASE_NOTE + 12)
  })
})

describe("VoiceAllocator", () => {
  it("steals the oldest voice at the cap", () => {
    const evicted: number[] = []
    const va = new VoiceAllocator<string>(2, (_v, note) => evicted.push(note))
    va.add(60, "a")
    va.add(64, "b")
    va.add(67, "c") // over cap → evict oldest (60)
    expect(evicted).toEqual([60])
    expect(va.size).toBe(2)
    expect(va.has(60)).toBe(false)
    expect(va.has(64)).toBe(true)
    expect(va.has(67)).toBe(true)
  })

  it("note-off removes and returns the right voice", () => {
    const va = new VoiceAllocator<string>(8, () => {})
    va.add(60, "kick")
    va.add(64, "snare")
    expect(va.remove(64)).toBe("snare")
    expect(va.has(64)).toBe(false)
    expect(va.has(60)).toBe(true)
    expect(va.remove(99)).toBeNull() // unknown note
  })

  it("re-triggering a held note evicts the previous instance", () => {
    const onEvict = vi.fn()
    const va = new VoiceAllocator<string>(8, onEvict)
    va.add(60, "first")
    va.add(60, "second")
    expect(onEvict).toHaveBeenCalledWith("first", 60)
    expect(va.size).toBe(1)
    expect(va.remove(60)).toBe("second")
  })

  it("clear returns all voices and empties", () => {
    const va = new VoiceAllocator<string>(8, () => {})
    va.add(60, "a")
    va.add(64, "b")
    expect(va.clear().sort()).toEqual(["a", "b"])
    expect(va.size).toBe(0)
  })
})
