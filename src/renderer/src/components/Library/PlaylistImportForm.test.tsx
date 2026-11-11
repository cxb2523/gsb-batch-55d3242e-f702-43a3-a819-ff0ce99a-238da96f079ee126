import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlaylistImportForm } from './PlaylistImportForm'

describe('PlaylistImportForm', () => {
  it('submits only when a URL is present', () => {
    const onSubmit = vi.fn()

    render(<PlaylistImportForm disabled={false} input="" status={null} onInputChange={vi.fn()} onSelectFile={vi.fn()} onSubmit={onSubmit} />)

    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()
  })

  it('reports URL changes and submit events', () => {
    const onSubmit = vi.fn()
    const onInputChange = vi.fn()

    render(
      <PlaylistImportForm
        disabled={false}
        input="demo:playlist"
        status="Ready"
        onInputChange={onInputChange}
        onSelectFile={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.change(screen.getByLabelText('Playlist URL'), {
      target: { value: 'demo:other-playlist' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(onInputChange).toHaveBeenCalledWith('demo:other-playlist')
    expect(onSubmit).toHaveBeenCalled()
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('reflects the importing state', () => {
    render(
      <PlaylistImportForm
        disabled
        input="demo:playlist"
        status="Reading playlist..."
        onInputChange={vi.fn()}
        onSelectFile={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Reading' })).toBeDisabled()
    expect(screen.getByLabelText('Playlist URL')).toBeDisabled()
  })

  it('lets the user choose a local M3U file', () => {
    const onSelectFile = vi.fn()

    render(
      <PlaylistImportForm
        disabled={false}
        input=""
        status={null}
        onInputChange={vi.fn()}
        onSelectFile={onSelectFile}
        onSubmit={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Choose M3U' }))
    expect(onSelectFile).toHaveBeenCalledOnce()
  })
})
