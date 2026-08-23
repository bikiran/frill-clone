// Shipping provider facade — picks whichever carrier-rate provider is configured
// and exposes one interface to the rest of the app. ShipStation is preferred
// when its key is set; Starshipit is the fallback. Neither configured → the app
// degrades to the manual printable-label path.

import * as starshipit from '@/lib/starshipit'
import * as shipstation from '@/lib/shipstation'
import type { ShipAddress, StarshipitRate, StarshipitLabel } from '@/lib/starshipit'

export type { ShipAddress } from '@/lib/starshipit'
export type ShipRate = StarshipitRate
export type ShipLabel = StarshipitLabel

export type Provider = 'shipstation' | 'starshipit'

export function activeProvider(): Provider | null {
  if (shipstation.shipstationConfigured()) return 'shipstation'
  if (starshipit.starshipitConfigured()) return 'starshipit'
  return null
}

export function shippingConfigured(): boolean {
  return activeProvider() !== null
}

type RatesOpts = {
  to: ShipAddress
  from?: ShipAddress | null
  weightGrams?: number | null
  parcel?: { length?: number; width?: number; height?: number } | null
  currency?: string
}

export async function getRatesDetailed(opts: RatesOpts): Promise<{ rates: ShipRate[]; raw: any; request: any; provider: Provider | null }> {
  const p = activeProvider()
  if (p === 'shipstation') return { ...(await shipstation.getRatesDetailed(opts)), provider: p }
  if (p === 'starshipit') return { ...(await starshipit.getRatesDetailed(opts)), provider: p }
  return { rates: [], raw: null, request: null, provider: null }
}

type ShipmentOpts = {
  orderNumber: string
  to: ShipAddress
  from?: ShipAddress | null
  weightGrams?: number | null
  parcel?: { length?: number; width?: number; height?: number } | null
  carrier?: string | null
  serviceCode?: string | null
  rateId?: string | null
  currency?: string
  items?: { description?: string | null; sku?: string | null; quantity?: number; value?: number }[]
}

export async function createShipment(opts: ShipmentOpts): Promise<ShipLabel | null> {
  const p = activeProvider()
  if (p === 'shipstation') return shipstation.createShipment(opts)
  if (p === 'starshipit') return starshipit.createShipment(opts)
  return null
}

// Reprint: the label PDF URL for an existing provider label id.
export async function getLabelUrl(providerRef: string): Promise<string | null> {
  const p = activeProvider()
  if (p === 'shipstation') return shipstation.getLabelUrl(providerRef)
  return null
}

// Void (cancel) a purchased label at the provider.
export async function voidLabel(providerRef: string): Promise<{ voided: boolean; message: string }> {
  const p = activeProvider()
  if (p === 'shipstation') return shipstation.voidLabel(providerRef)
  return { voided: false, message: 'Voiding not supported for this provider' }
}
