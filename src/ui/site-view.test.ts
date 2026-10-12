import { describe, expect, it } from 'vitest';
import { validateRecordInput } from '../domain/record-input';
import { EMPTY_INPUT } from './draft';
import { openingTab, siteLabel } from './site-view';

describe('openingTab', () => {
  it('opens on the codes for this site when there are any (D-092)', () => {
    expect(openingTab(1)).toBe('site');
    expect(openingTab(3)).toBe('site');
  });

  it('opens on the form when this site has no codes', () => {
    expect(openingTab(0)).toBe('add');
  });
});

describe('siteLabel', () => {
  it.each([
    ['www.dropbox.com', 'dropbox.com'],
    ['help.eu.dropbox.com', 'dropbox.com'],
    ['shop.example.co.uk', 'example.co.uk'],
    ['checkout.mystore.myshopify.com', 'mystore.myshopify.com'],
    ['www.xn--mnchen-3ya.de', 'münchen.de'],
  ])('names %s as %s', (host, name) => {
    expect(siteLabel(host)).toEqual({ name, address: name });
  });

  it.each([
    ['an IP address', '192.168.0.1'],
    ['localhost', 'localhost'],
    ['a shared platform itself', 'myshopify.com'],
  ])('offers no address for %s, and names it by its host', (_label, host) => {
    expect(siteLabel(host)).toEqual({ name: host });
  });

  it.each(['www.dropbox.com', 'www.xn--mnchen-3ya.de', 'shop.example.co.uk'])(
    'gives an address for %s that saves the code for the same site',
    (host) => {
      const label = siteLabel(host);
      const saved = validateRecordInput({
        ...EMPTY_INPUT,
        promoCode: 'X',
        resourceUrl: label.address ?? '',
      });
      const fromHost = validateRecordInput({ ...EMPTY_INPUT, promoCode: 'X', resourceUrl: host });
      expect(saved.ok && saved.fields.merchantDomain).toBe(
        fromHost.ok && fromHost.fields.merchantDomain,
      );
    },
  );
});
