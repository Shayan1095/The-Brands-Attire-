const fs = require('fs');

const content = fs.readFileSync('C:\\Users\\mfabid\\My stack\\projects\\ZCodeProject\\shared.js', 'utf-8');

const old = '  // scroll reveal\n  const io = new IntersectionObserver((entries)=>{ entries.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); } }); }, { threshold:.12 }); document.querySelectorAll(".reveal").forEach(el=>io.observe(el));';

const newCode = `  // scroll reveal
  const io = new IntersectionObserver((entries)=>
    entries.forEach(en=>{
      if(en.isIntersecting){
        const siblings = Array.from(en.target.parentElement.querySelectorAll(".reveal"));
        const idx = siblings.indexOf(en.target);
        if (idx >= 0) en.target.style.transitionDelay = \`\${idx * 80}ms\`;
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    })
  , { threshold:.12 });
  document.querySelectorAll(".reveal").forEach(el=>io.observe(el));`;

if (content.includes(old)) {
    const newContent = content.replace(old, newCode);
    fs.writeFileSync('C:\\Users\\mfabid\\My stack\\projects\\ZCodeProject\\shared.js', newContent, 'utf-8');
    console.log('Done - replaced successfully');
} else {
    console.log('Old text not found!');
    // Let's find what's actually there
    const idx = content.indexOf('scroll reveal');
    if (idx >= 0) {
        console.log('Found at index:', idx);
        console.log('Context:', content.substring(idx, idx + 200));
    }
}