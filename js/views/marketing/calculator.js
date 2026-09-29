import { html } from '../../ui/html.js';
import { onSubmit } from '../../ui/actions.js';
import { toast } from '../../ui/components.js';
import { update, logActivity, today } from '../../data/store.js';
import { uid } from '../../core/util.js';
import { blankDeal, builderLayout, mountBuilder, readDealForm } from '../deal-form.js';

let draft = null;

export const calculatorView = {
  layout: 'marketing',
  nav: 'calculator',
  title: 'Seller-financing calculator',
  render() {
    draft = draft || blankDeal();
    return html`
    <section class="section tight">
      <div class="container">
        <div class="eyebrow">Free tool</div>
        <h1 class="section-title display" style="font-size:clamp(1.9rem,3.6vw,2.7rem)">Seller-financing calculator</h1>
        <p class="lead mb-3">See the buyer’s payment, what you’ll collect, when a balloon comes due, and whether the deal fits federal seller-financing rules. Everything updates as you type.</p>
        ${builderLayout(draft, 'public')}
      </div>
    </section>`;
  },
  mount(main) {
    return mountBuilder(main, draft);
  },
};

onSubmit({
  'calc-save': (form) => {
    const builder = form.closest('.deal-builder');
    const d = readDealForm(form, builder._base);
    draft = d;
    const id = uid('deal');
    update((s) => {
      s.deals.unshift({
        ...d,
        id,
        code: null,
        status: 'draft',
        createdAt: today(),
        property: { ...d.property, address: 'New listing', city: '', zip: '', description: '' },
      });
      logActivity('Draft created from the calculator', `#/app/deals/${id}`);
    });
    toast('Saved as a draft deal. Add the property details next.');
    location.hash = `#/app/deals/${id}/edit`;
  },
});
