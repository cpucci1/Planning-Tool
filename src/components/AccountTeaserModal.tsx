/**
 * Teaser de "créate una cuenta gratis" — MAQUETA, no conectada a nada.
 *
 * Aparece una vez por sesión, cuando el usuario lleva visto el desglose de
 * personal (StepResult lo dispara con un IntersectionObserver sobre esa
 * sección). El envío no manda el email/móvil a ningún sitio: es para probar
 * el copy y el momento en que sale, antes de decidir a qué sistema real
 * engancharlo — guardado local, un servicio externo, lo que se decida. Ver
 * CLAUDE.md, sección "Cuentas (maqueta)".
 *
 * Se puede cerrar en cualquier momento ("Seguir sin cuenta"): el "Sin
 * registro" de la portada sigue siendo cierto hoy, esto es solo el hueco
 * donde iría el día que deje de serlo.
 */

import { useState, type FormEvent } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { Button, Modal, Note, TextInput } from './ui'

export function AccountTeaserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  function handleClose() {
    onClose()
    // El reseteo se retrasa para no ver el formulario en blanco mientras el
    // modal todavía se está cerrando.
    setTimeout(() => {
      setSent(false)
      setEmail('')
      setPhone('')
    }, 300)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Maqueta: no hay backend al que mandar esto todavía.
    setSent(true)
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={sent ? '¡Ya casi!' : 'Créate una cuenta gratis para no perderlo'}
      subtitle={
        sent
          ? undefined
          : 'Guarda esta plantilla con los nombres de tu equipo y vuelve cuando quieras a seguir editándola.'
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-success-light text-success">
            <Check size={22} strokeWidth={3} />
          </span>
          <p className="max-w-xs text-[0.92rem] leading-relaxed text-content-secondary">
            Te avisamos en cuanto puedas entrar con tu cuenta y seguir justo donde lo dejaste.
          </p>
          <Button onClick={handleClose}>Seguir viendo mi plantilla</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="teaser-email"
              className="mb-1.5 block text-[0.8rem] font-bold text-content-secondary"
            >
              Email
            </label>
            <TextInput
              id="teaser-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@restaurante.com"
            />
          </div>
          <div>
            <label
              htmlFor="teaser-phone"
              className="mb-1.5 block text-[0.8rem] font-bold text-content-secondary"
            >
              Móvil <span className="font-normal text-content-muted">(opcional)</span>
            </label>
            <TextInput
              id="teaser-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="600 000 000"
            />
          </div>
          <Note tone="brand" icon={<Sparkles size={15} strokeWidth={2.3} />}>
            Sin cuota, sin tarjeta. Solo para que este cálculo no se pierda cuando cierres la
            pestaña.
          </Note>
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-pill px-2 py-1.5 text-[0.85rem] font-semibold text-content-secondary transition-colors hover:text-content-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Seguir sin cuenta
            </button>
            <Button type="submit">Crear mi cuenta gratis</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
