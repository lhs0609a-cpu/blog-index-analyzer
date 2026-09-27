(function () {
  'use strict';
  // Intentionally no network sender, automatic URL/referrer capture, or contact data.
  const allowedCampaigns = new Set(['c01', 'c02', 'c03', 'b01']);
  const allowedPages = new Set(['p01', 'p02']);
  const page = allowedPages.has(document.body.dataset.pageCode) ? document.body.dataset.pageCode : 'unknown';
  const campaign = new URLSearchParams(location.search).get('af');
  const safeCampaign = allowedCampaigns.has(campaign) ? campaign : null;
  let consent = false, lastClick = '', lastAt = 0;
  const events = [];
  function emit(event, channel) {
    if (!['page_view', 'contact_click', 'phone_click'].includes(event)) throw new Error('Only interaction events are accepted');
    const record = { event, page_code: page, channel: channel || 'web', campaign_code: safeCampaign };
    events.push(record);
    document.dispatchEvent(new CustomEvent('sojam:interaction', { detail: Object.freeze({ ...record }) }));
    return record;
  }
  document.addEventListener('click', function (e) {
    const a = e.target.closest('[data-contact]');
    if (!a) return;
    const channel = a.dataset.contact;
    if (!['kakao', 'phone'].includes(channel)) return;
    const key = channel + a.getAttribute('href');
    if (lastClick === key && Date.now() - lastAt < 800) return;
    lastClick = key; lastAt = Date.now();
    emit(channel === 'phone' ? 'phone_click' : 'contact_click', channel);
  });
  window.SojamMeasurement = Object.freeze({
    getEvents: () => events.map(e => ({ ...e })),
    setConsent: function (value) {
      consent = value === true;
      try {
        if (consent && safeCampaign) sessionStorage.setItem('sojam_campaign_code', safeCampaign);
        else sessionStorage.removeItem('sojam_campaign_code');
      } catch (_) { /* Storage refusal must not break contact links. */ }
    },
    getConsentedCampaign: () => consent ? safeCampaign : null,
    // No intake/booking/visit event can be emitted here: those come from internal records.
  });
  emit('page_view');
}());
