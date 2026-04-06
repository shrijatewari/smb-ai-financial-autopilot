/**
 * Layer-1 headline lines for Today – Hindi (Devanagari), English, Tamil, Telugu, Bengali.
 * `hinglish` = Roman transliterated Hindi for HI+EN mode (not Devanagari).
 */

function mk(hi, en, ta, te, bn, urgent = false, hinglish) {
  const o = { hi, en, ta, te, bn, urgent }
  if (hinglish !== undefined) o.hinglish = hinglish
  return o
}

export function headlineFromSnap(snap) {
  const dc = snap?.daily_control
  const daysNeg = dc?.days_to_negative
  const risk = snap?.risk
  if (daysNeg != null && daysNeg <= 14) {
    return mk(
      `⚠️ ${daysNeg} दिन में पैसा खत्म हो सकता है`,
      `⚠️ Cash may run out in ~${daysNeg} days`,
      `⚠️ ${daysNeg} நாட்களில் பணம் குறையலாம்`,
      `⚠️ ${daysNeg} రోజుల్లో నగదు తగ్గవచ్చు`,
      `⚠️ ~${daysNeg} দিনের মধ্যে নগদ ফুরিয়ে যেতে পারে`,
      true,
      `⚠️ ${daysNeg} din mein paisa khatam ho sakta hai`,
    )
  }
  if (risk != null && risk > 0.25) {
    const pct = (100 * risk).toFixed(0)
    return mk(
      `⚠️ नकद जोखिम ज़्यादा है – लगभग ${pct}% संभावना तनाव की`,
      `⚠️ Cash risk is high – about ${pct}% chance of stress`,
      `⚠️ பண அபாயம் அதிகம் – சுமார் ${pct}% வாய்ப்பு`,
      `⚠️ నగదు ప్రమాదం ఎక్కువ – సుమారు ${pct}% అవకాశం`,
      `⚠️ নগদ ঝুঁকি বেশি – প্রায় ${pct}% সম্ভাবনা`,
      true,
      `⚠️ Nakad jokhim zyada hai – lagbhag ${pct}% sambhavna tanav ki`,
    )
  }
  if (daysNeg != null) {
    return mk(
      `स्ट्रेस टाइमिंग ~${daysNeg} दिन – वसूली फॉलो करें`,
      `Stress timing ~${daysNeg} days – follow up collections`,
      `அழுத்த காலம் ~${daysNeg} நாட்கள் – வசூலை பின்பற்றவும்`,
      `స్ట్రెస్ టైమింగ్ ~${daysNeg} రోజులు – కలెక్షన్‌లను ఫాలో అప్ చేయండి`,
      `স্ট্রেস টাইমিং ~${daysNeg} দিন – আদায় ফলো করুন`,
      false,
      `Stress timing ~${daysNeg} din – vasooli follow karein`,
    )
  }
  return mk(
    'आज नकद स्थिर लग रहा है – फिर भी बकाया फॉलो करें',
    'Cash looks stable today – still follow up on dues',
    'இன்று பணம் நிலையாக உள்ளது – இருப்பினும் பாக்கிகளை பின்பற்றவும்',
    'ఇవాల్టి నగదు స్థిరంగా ఉంది – అయినా బకాయాలను ఫాలో అప్ చేయండి',
    'আজ নগদ স্থিতিশীল মনে হচ্ছে – তবুও বকেয়া ফলো করুন',
    false,
    'Aaj nakad sthir lag raha hai – phir bhi bakaya follow karein',
  )
}

export function layer1FromSnap(snap, ctx) {
  const dc = snap?.daily_control
  const daysNeg = dc?.days_to_negative
  const risk = snap?.risk
  const rl = ctx?.risk_level

  if (rl === 'high' || (daysNeg != null && daysNeg <= 7) || (risk != null && risk > 0.35)) {
    const d = daysNeg
    if (d != null) {
      return mk(
        `⚠️ ज़रूरी: ~${d} दिन में नकद खत्म`,
        `⚠️ Urgent: cash may run out in ~${d} days`,
        `⚠️ அவசரம்: ~${d} நாட்களில் பணம் குறையலாம்`,
        `⚠️ అత్యవసరం: ~${d} రోజుల్లో నగదు అయిపోవచ్చు`,
        `⚠️ জরুরি: ~${d} দিনের মধ্যে নগদ শেষ`,
        true,
        `⚠️ Zaroori: ~${d} din mein nakad khatam`,
      )
    }
    return mk(
      '⚠️ ज़रूरी: नकद जोखिम बहुत ज़्यादा – अभी वसूली करें',
      '⚠️ Urgent: very high cash risk – collect now',
      '⚠️ அவசரம்: பண அபாயம் மிக அதிகம் – இப்போது வசூலிக்கவும்',
      '⚠️ అత్యవసరం: నగదు ప్రమాదం చాలా ఎక్కువ – ఇప్పుడే వసూలు చేయండి',
      '⚠️ জরুরি: নগদ ঝুঁকি খুব বেশি – এখনই আদায় করুন',
      true,
      '⚠️ Zaroori: nakad jokhim bahut zyada – abhi vasooli karein',
    )
  }
  if (rl === 'low' && (daysNeg == null || daysNeg > 14) && (risk == null || risk < 0.18)) {
    return mk(
      '✅ आज सब सुरक्षित है – फिर भी बकाया फॉलो करें',
      '✅ All safe today – still follow up on dues',
      '✅ இன்று அனைத்தும் பாதுகாப்பானது – இருப்பினும் பாக்கிகளை பின்பற்றவும்',
      '✅ ఇవాల్టి అన్నీ సురక్షితం – అయినా బకాయాలను ఫాలో అప్ చేయండి',
      '✅ আজ সব নিরাপদ – তবুও বকেয়া ফলো করুন',
      false,
      '✅ Aaj sab surakshit hai – phir bhi bakaya follow karein',
    )
  }
  return headlineFromSnap(snap)
}
