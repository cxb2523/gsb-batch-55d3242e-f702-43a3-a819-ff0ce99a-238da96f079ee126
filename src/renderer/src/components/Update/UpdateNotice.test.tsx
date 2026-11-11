import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UpdateNotice } from './UpdateNotice'

describe('UpdateNotice', () => {
  it('announces the version and routes download and dismiss actions', () => {
    const onDownload = vi.fn()
    const onDismiss = vi.fn()

    render(
      <UpdateNotice
        error={null}
        openingDownload={false}
        update={{
          available: true,
          currentVersion: '0.1.1',
          latestVersion: '0.1.2',
          downloadUrl: 'https://github.com/antoniolg/next-dj/releases/tag/v0.1.2'
        }}
        onDismiss={onDismiss}
        onDownload={onDownload}
      />
    )

    expect(screen.getByRole('status', { name: 'Application update' })).toHaveTextContent('NextDJ 0.1.2 is available')
    fireEvent.click(screen.getByRole('button', { name: 'Download update' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notice' }))

    expect(onDownload).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('shows browser errors and disables duplicate download attempts', () => {
    render(
      <UpdateNotice
        error="Could not open the update download. Please try again."
        openingDownload
        update={{
          available: true,
          currentVersion: '0.1.1',
          latestVersion: '0.1.2',
          downloadUrl: 'https://github.com/antoniolg/next-dj/releases/tag/v0.1.2'
        }}
        onDismiss={vi.fn()}
        onDownload={vi.fn()}
      />
    )

    expect(screen.getByText('Could not open the update download. Please try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opening…' })).toBeDisabled()
  })
})
