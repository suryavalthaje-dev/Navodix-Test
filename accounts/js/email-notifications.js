/* Navodix Accounts email notifications. Delivery runs server-side and is deliberately non-blocking. */
(function () {
  'use strict';
  const db = window.navodixSupabase;
  const ready = window.navodixAccountsAuthReady;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function sendClaimEvent(event, claimId, reason) {
    try {
      await ready;
      let claim = null;
      for (let i = 0; i < 4; i++) {
        const { data, error } = await db.from('acc_expense_claims')
          .select('id,claim_no,status,submitted_by,updated_at')
          .eq('id', claimId).maybeSingle();
        if (error) throw error;
        claim = data;
        const expected = event === 'approved' ? 'Approved – Payment Pending' : event === 'rejected' ? 'Rejected' : 'Pending Approval';
        if (claim?.status === expected) break;
        await delay(350);
      }
      if (!claim) throw new Error('The updated expense claim could not be found.');
      const eventKey = `expense-claim:${claim.id}:${event}:${crypto.randomUUID()}`;
      const { data, error } = await db.functions.invoke('accounts-notifications', {
        body: { action: 'notify', event, claim_id: claim.id, event_key: eventKey, reason: reason || null }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Email notification could not be queued.');
      if (data.failed) console.warn(`Accounts email notification: ${data.sent} sent, ${data.failed} failed. Failed deliveries are retained for retry.`);
    } catch (error) {
      // A mail delivery problem must never reverse or block the completed financial workflow.
      console.error('Accounts email notification could not be completed:', error);
    }
  }

  window.navodixAccountsNotifyClaim = sendClaimEvent;

  function wrap(name, getEvent) {
    const original = window[name];
    if (typeof original !== 'function' || original.__accountsEmailWrapped) return;
    const wrapped = async function (...args) {
      const result = await original.apply(this, args);
      try {
        const event = getEvent(args);
        if (event) await sendClaimEvent(event.event, event.claimId, event.reason);
      } catch (error) { console.error('Unable to trigger Accounts email notification:', error); }
      return result;
    };
    wrapped.__accountsEmailWrapped = true;
    window[name] = wrapped;
  }

  ready.then(() => {
    // Claim submission: resolve the latest pending claim belonging to the signed-in director.
    const originalSaveSheet = window.saveSheet;
    if (typeof originalSaveSheet === 'function' && !originalSaveSheet.__accountsSubmissionWrapped) {
      const wrappedSave = async function (...args) {
        const before = new Set((window.sheets || []).map(x => x.dbId));
        const result = await originalSaveSheet.apply(this, args);
        try {
          const me = window.navodixAccountsProfile?.id;
          const { data, error } = await db.from('acc_expense_claims').select('id,status,created_at')
            .eq('submitted_by', me).eq('status', 'Pending Approval').is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(5);
          if (error) throw error;
          const claim = (data || []).find(x => !before.has(x.id)) || data?.[0];
          if (claim) await sendClaimEvent('submitted', claim.id);
        } catch (error) { console.error('Expense claim submission email trigger failed:', error); }
        return result;
      };
      wrappedSave.__accountsSubmissionWrapped = true;
      window.saveSheet = wrappedSave;
    }

    wrap('approveSheetDb', args => {
      const claim = (window.sheets || []).find(x => x.id === args[0] || x.dbId === args[0]);
      return claim ? { event: 'approved', claimId: claim.dbId } : null;
    });
    const originalReject = window.rejectSheetDb;
    if (typeof originalReject === 'function' && !originalReject.__accountsEmailWrapped) {
      const wrappedReject = function (...args) {
        const claim = (window.sheets || []).find(x => x.id === args[0] || x.dbId === args[0]);
        const result = originalReject.apply(this, args);
        const callback = window.__standardInputCallback;
        if (claim && typeof callback === 'function') {
          window.__standardInputCallback = async function (reason) {
            await callback(reason);
            await sendClaimEvent('rejected', claim.dbId, reason || null);
          };
        }
        return result;
      };
      wrappedReject.__accountsEmailWrapped = true;
      window.rejectSheetDb = wrappedReject;
    }

    wrap('submitSheetAgain', args => {
      const claim = (window.sheets || []).find(x => x.id === args[0] || x.dbId === args[0]);
      return claim ? { event: 'resubmitted', claimId: claim.dbId } : null;
    });
  }).catch(error => console.error('Accounts email notification integration initialization failed:', error));

  window.retryAccountsEmailNotification = async function (notificationId) {
    try {
      await ready;
      const { data, error } = await db.functions.invoke('accounts-notifications', { body: { action: 'retry', notification_id: notificationId } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Retry failed');
      return data;
    } catch (error) {
      console.error('Accounts notification retry failed:', error);
      throw error;
    }
  };
})();
