(function(){
  try {
    const doc = window.document;
    const slides = doc.querySelectorAll('#slides > section, .slide, section[data-slide]');
    const total  = slides.length || 1;
    let current  = 1;
    function emit(extra){
      try { window.parent.postMessage(Object.assign({ type:'lesson-progress', slide: current, total }, extra||{}), '*'); } catch(e){}
    }
    function syncIndex(){
      let idx=current;
      const active = doc.querySelector('#slides > section.active, .slide.active, section[data-active="true"]');
      if (active){ const arr=Array.from(slides); const i=arr.indexOf(active); if (i>=0) idx=i+1; }
      current=idx; emit();
    }
    new MutationObserver(syncIndex).observe(doc.body, { attributes:true, subtree:true, attributeFilter:['class','data-active','style'] });
    setInterval(syncIndex, 2000);
    doc.body.addEventListener('click', e=>{ const el = e.target.closest('[data-complete], .mark-complete, button.finish, button.complete, .btn-complete'); if (el) emit({ complete:true }); });
    const ansObs=new MutationObserver(muts=>{ for (const m of muts){ if (m.type==='attributes'){ const t=m.target; if ((t.classList&&t.classList.contains('correct'))||t.dataset?.correct==='true'){ emit({ maybeCorrect:true }); } } } });
    ansObs.observe(doc.body, { attributes:true, subtree:true });
    emit();
  } catch(e){ try { window.parent.postMessage({ type:'lesson-progress', error: String(e) }, '*'); } catch(_){} }
})();