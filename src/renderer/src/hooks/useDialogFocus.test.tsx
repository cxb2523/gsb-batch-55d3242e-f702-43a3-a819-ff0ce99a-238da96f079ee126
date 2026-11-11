import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDialogFocus } from './useDialogFocus'

function DialogHarness(): JSX.Element {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<HTMLButtonElement>(null)

  useDialogFocus({ open, containerRef: dialogRef, initialFocusRef, onClose: () => setOpen(false) })

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <div ref={dialogRef} role="dialog" tabIndex={-1}>
          <button ref={initialFocusRef} type="button">
            First
          </button>
          <button type="button">Last</button>
        </div>
      ) : null}
    </>
  )
}

describe('useDialogFocus', () => {
  it('traps focus and returns it to the opener', async () => {
    render(<DialogHarness />)
    const opener = screen.getByRole('button', { name: 'Open' })

    opener.focus()
    fireEvent.click(opener)
    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    await waitFor(() => expect(first).toHaveFocus())

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(opener).toHaveFocus())
  })
})
