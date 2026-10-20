# Photo QR NEST SD — Privacy-first upload backend

এই প্যাকেজে ওয়েবপেজ এবং ছবির জন্য ছোট Node.js backend আছে। এটি আগের HTML-এর third-party auto-upload বাদ দিয়ে নিজের backend-এ আপলোড করে।

## গোপনীয়তার ব্যবস্থা
- আপলোডের আগে ব্যবহারকারীকে স্পষ্ট consent checkbox টিক দিতে হয়।
- ছবি 5 MB-এর মধ্যে এবং JPEG/PNG/WebP হতে হবে।
- ছবিকে re-encode করে EXIF/GPS metadata বাদ দেওয়ার চেষ্টা করা হয়।
- ফাইলের নাম random ID; মূল filename প্রকাশ করা হয় না।
- 24 ঘণ্টা পরে ফাইল মুছতে cleanup চলে; এটি best-effort, চিরস্থায়ী নিশ্চয়তা নয়।
- upload API-তে rate limit আছে; অ্যাপ image payload বা URL log করে না।
- QR/link যার কাছে থাকবে, সে ছবিটি দেখতে পারবে। QR অন্য কেউ কপি করে রাখলে সেটি নিয়ন্ত্রণ করা যায় না। সংবেদনশীল ছবি আপলোড করবেন না।

## চালানোর নিয়ম (Node.js 20+)
1. এই ফোল্ডারটি কম্পিউটারে extract করুন।
2. Terminal/Command Prompt-এ এই ফোল্ডারে গিয়ে `npm install` চালান।
3. `npm start` চালান।
4. ব্রাউজারে `http://localhost:3000` খুলুন। লোকাল পরীক্ষা করা যাবে; অন্য ফোনে ব্যবহারের জন্য HTTPS-এ deploy করতে হবে।

## সহজ HTTPS deployment (Render Free)
1. এই ফোল্ডারের সব ফাইল GitHub repository-তে upload করুন।
2. Render-এ New + Blueprint নির্বাচন করে repository connect করুন; `render.yaml` থেকে Free web service তৈরি হবে।
3. Deploy শেষ হলে Render-এর দেওয়া `https://...onrender.com` ঠিকানাটি খুলুন এবং `/api/health`-এ `{"ok":true,...}` দেখুন।
4. Render ঘুমিয়ে যেতে পারে; প্রথমবার চালু হতে সময় লাগতে পারে। Free service-এর local disk স্থায়ী নয়, তাই restart/deploy হলে ছবি আগে মুছে যেতে পারে। কোনো paid disk যোগ করবেন না যদি খরচ না চান।

## বিকল্প HTTPS deployment
- পুরো ফোল্ডারটি Node.js support-সহ hosting provider-এ deploy করুন।
- `PUBLIC_BASE_URL` environment variable-এ deployment-এর HTTPS base URL দিন (যেমন আপনার provider দেওয়া আসল URL)।
- hosting-এর persistent disk/volume থাকলে `uploads` directory-টি সেখানে রাখুন। ephemeral storage হলে restart/deploy-এ ছবি আগেই মুছে যেতে পারে।
- hosting provider-এর access logs, backups, disk persistence এবং privacy terms আলাদাভাবে যাচাই করতে হবে। এই code নিজে hosting-provider logs/backups মুছতে পারে না।
- live site test না করা পর্যন্ত কাজটি production-ready ধরে নেবেন না।

## সীমাবদ্ধতা
এটি backend code package; এখানে থেকে আপনার নামে hosting account তৈরি বা deploy করা হয়নি। তাই এখনই live upload link নেই। Free host-এ permanent public upload না করে 24-hour expiry-র best-effort পদ্ধতি রাখা হয়েছে।
