/* pricing.jsx — internal credit economics.
   This is the small auditable table behind user-facing credit estimates. Keep it
   boring: provider list-price assumptions in USD, then helpers that convert raw
   provider cost into Cinema Machine credits.

   Pricing policy:
   - CREDIT_SCALE only changes the visible denomination (800 instead of 80).
   - BASE_PROVIDER_USD_PER_CREDIT is the old unscaled anchor: 1 base credit ≈ $0.30.
   - Therefore 1 visible credit ≈ $0.03 of raw provider spend before Stripe fees,
     taxes, storage, retries, support, and margin.
   - Text rates are provider-token based when the proxy returns usage, with the
     flat table below kept only as an older-deploy display fallback.
   - Image/video rates are provider-cost based. */

(function(){
  const CREDIT_SCALE = 10;
  const BASE_PROVIDER_USD_PER_CREDIT = 0.30;

  const TURN_PRICING = {
    version: "2026-07-25",
    currency: "USD",
    credit: {
      scale: CREDIT_SCALE,
      baseProviderUsd: BASE_PROVIDER_USD_PER_CREDIT,
      visibleProviderUsd: BASE_PROVIDER_USD_PER_CREDIT / CREDIT_SCALE,
    },
    buffers: {
      stripePercent: 0.029,
      stripeFixedUsd: 0.30,
      opsBufferPercent: 0.15,
      targetGrossMarginPercent: 0.45,
    },
    text: {
      note: "Token-based proxy accounting for successful text calls; creditRates are a display fallback for older proxy deploys.",
      creditRates: {
        "claude-fable-5": 0.25,
        "claude-opus-5": 0.15,
        "claude-sonnet-5": 0.08,
        "kimi-k3": 0.06,
        "kimi-k2.7-code": 0.03,
        muse: 0.03,
        vision: 0.20,
        default: 0.10,
      },
    },
    image: {
      note: "Estimated accepted-output provider cost per generated image; Art Room image costs are visible before generation and deducted server-side after success.",
      providerUsd: {
        "gemini-3.1-flash-lite-image": { "1K":0.034, "2K":0.050, "4K":0.076 },
        "gemini-3.1-flash-image":      { "1K":0.067, "2K":0.101, "4K":0.151 },
        "gemini-3-pro-image":          { "1K":0.134, "2K":0.134, "4K":0.240 },
        "gpt-image-2":                 { low:0.009, medium:0.080, high:0.317 },
      },
    },
    video: {
      note: "Provider USD per output second. Stage converts this into credits and deducts after a successful render.",
      providerUsdPerSecond: {
        "seedance-2.0": {
          standard: { "480p":0.1512, "720p":0.3034, "1080p":0.6820, "4K":1.5500 },
          fast:     { "480p":0.1210, "720p":0.2427 },
        },
        "kling-3.0": {
          standard: { "480p":0.1260, "720p":0.1260, "1080p":0.1260 },
          pro:      { "480p":0.1680, "720p":0.1680, "1080p":0.1680 },
        },
      },
    },
    packs: {
      current: [
        { sku:"credits-300", credits:300, priceUsd:9 },
        { sku:"credits-1200", credits:1200, priceUsd:29 },
        { sku:"credits-4000", credits:4000, priceUsd:79 },
      ],
      saferSuggested: [
        { sku:"credits-300", credits:300, priceUsd:12 },
        { sku:"credits-1200", credits:1200, priceUsd:49 },
        { sku:"credits-4000", credits:4000, priceUsd:159 },
      ],
    },
  };

  function turnProviderUsdPerBaseCredit(){
    return TURN_PRICING.credit.baseProviderUsd;
  }
  function turnCreditsFromProviderUsd(usd){
    return (Number(usd)||0) / TURN_PRICING.credit.baseProviderUsd * TURN_PRICING.credit.scale;
  }
  function turnImageProviderUsdTable(){
    return TURN_PRICING.image.providerUsd;
  }
  function turnVideoCreditRate(modelId, tierId, resolution){
    const usd = (((TURN_PRICING.video.providerUsdPerSecond[modelId]||{})[tierId]||{})[resolution]);
    return Number(usd)>0 ? Number(usd) / TURN_PRICING.credit.baseProviderUsd : null;
  }
  function turnVideoCreditRates(modelId, tierId){
    const src = ((TURN_PRICING.video.providerUsdPerSecond[modelId]||{})[tierId]) || null;
    if(!src) return null;
    const out = {};
    Object.keys(src).forEach(k=>{ out[k] = src[k] / TURN_PRICING.credit.baseProviderUsd; });
    return out;
  }
  function turnCreditPackEconomics(pack){
    const price = Number(pack && pack.priceUsd) || 0;
    const credits = Number(pack && pack.credits) || 0;
    const stripe = price ? (price * TURN_PRICING.buffers.stripePercent + TURN_PRICING.buffers.stripeFixedUsd) : 0;
    const providerExposure = credits * TURN_PRICING.credit.visibleProviderUsd;
    const net = price - stripe;
    return {
      sku: pack && pack.sku,
      priceUsd: price,
      credits,
      stripeFeeUsd: Math.round(stripe*100)/100,
      netAfterStripeUsd: Math.round(net*100)/100,
      providerExposureUsd: Math.round(providerExposure*100)/100,
      marginUsd: Math.round((net-providerExposure)*100)/100,
      marginPercent: price ? Math.round(((net-providerExposure)/price)*1000)/10 : null,
    };
  }

  window.CREDIT_SCALE = CREDIT_SCALE;
  window.TURN_PRICING = TURN_PRICING;
  window.turnProviderUsdPerBaseCredit = turnProviderUsdPerBaseCredit;
  window.turnCreditsFromProviderUsd = turnCreditsFromProviderUsd;
  window.turnImageProviderUsdTable = turnImageProviderUsdTable;
  window.turnVideoCreditRate = turnVideoCreditRate;
  window.turnVideoCreditRates = turnVideoCreditRates;
  window.turnCreditPackEconomics = turnCreditPackEconomics;
})();
