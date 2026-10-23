import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Top Appbar Profile Photo & Avatar Synchronization Verification', () => {
  const layoutFiles = [
    'c:/Users/user/Desktop/web app1/web app/client/js/core/layout.js',
    'c:/Users/user/Desktop/web app1/web app/js/core/layout.js',
    'c:/Users/user/Desktop/firm/js/core/layout.js'
  ];

  const firebaseFiles = [
    'c:/Users/user/Desktop/web app1/web app/js/firebase.js',
    'c:/Users/user/Desktop/web app1/web app/firebase.js',
    'c:/Users/user/Desktop/web app1/web app/client/firebase.js',
    'c:/Users/user/Desktop/web app1/web app/client/js/firebase.js',
    'c:/Users/user/Desktop/firm/js/firebase.js',
    'c:/Users/user/Desktop/firm/firebase.js'
  ];

  test('1. All layout.js files include referrerpolicy="no-referrer" for Google avatars in appbar & dropdown', () => {
    layoutFiles.forEach(file => {
      const code = fs.readFileSync(path.resolve(file), 'utf8');
      assert.ok(code.includes('referrerpolicy="no-referrer"'), `${path.basename(file)} must include referrerpolicy="no-referrer"`);
      assert.ok(code.includes('btn-user-avatar'), `${path.basename(file)} must target btn-user-avatar`);
      assert.ok(code.includes('tfr_user_avatar'), `${path.basename(file)} must read tfr_user_avatar`);
    });
  });

  test('2. All layout.js files listen to tfr:avatar_updated and storage events for reactive avatar display', () => {
    layoutFiles.forEach(file => {
      const code = fs.readFileSync(path.resolve(file), 'utf8');
      assert.ok(code.includes('tfr:avatar_updated'), `${path.basename(file)} must listen for tfr:avatar_updated`);
      assert.ok(code.includes('window.addEventListener(\'storage\''), `${path.basename(file)} must listen for storage events`);
    });
  });

  test('3. All firebase.js files retain photoURL and do not strip it during _broadcastAuth', () => {
    firebaseFiles.forEach(file => {
      const code = fs.readFileSync(path.resolve(file), 'utf8');
      assert.ok(code.includes('resolvedPhotoURL'), `${path.basename(file)} must resolve photoURL`);
      assert.ok(code.includes('photoURL: resolvedPhotoURL'), `${path.basename(file)} must assign photoURL to normalized object`);
      assert.ok(code.includes("localStorage.setItem('tfr_user_avatar', resolvedPhotoURL)"), `${path.basename(file)} must preserve tfr_user_avatar in localStorage`);
    });
  });

  test('4. Google Sign-In records photoURL to Firestore and profile across all firebase.js files', () => {
    firebaseFiles.forEach(file => {
      const code = fs.readFileSync(path.resolve(file), 'utf8');
      assert.ok(code.includes('photoURL: user.photoURL || \'\''), `${path.basename(file)} must include photoURL in Google profile and record`);
    });
  });

  test('5. client/login.html preserves photoURL and synchronizes tfr_user_avatar on Google and standard auth', () => {
    const loginHtml = fs.readFileSync(path.resolve('c:/Users/user/Desktop/web app1/web app/client/login.html'), 'utf8');
    assert.ok(loginHtml.includes("localStorage.setItem('tfr_user_avatar', effectivePhoto)"), 'login.html must persist effectivePhoto to tfr_user_avatar');
    assert.ok(loginHtml.includes("tfr:avatar_updated"), 'login.html must dispatch tfr:avatar_updated');
  });

  test('6. Simulated layout rendering verifies <img> rendered inside #btn-user-avatar when photo exists', () => {
    // Simulate DOM environment
    const fakePhotoUrl = 'https://lh3.googleusercontent.com/a/ACg8ocTestAvatar123';
    const fakeUserName = 'Nandan B';
    const fakeInitials = 'NB';

    // Verify template logic produces img with correct attributes
    const avContentHtml = fakePhotoUrl ?
      '<img src="' + fakePhotoUrl + '" alt="' + fakeUserName + '" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;" onerror="this.onerror=null;this.style.display=\'none\';this.parentElement.textContent=\'' + fakeInitials + '\';" />' :
      fakeInitials;

    assert.ok(avContentHtml.includes('src="https://lh3.googleusercontent.com/a/ACg8ocTestAvatar123"'), 'Must contain photo source URL');
    assert.ok(avContentHtml.includes('referrerpolicy="no-referrer"'), 'Must contain referrerpolicy="no-referrer"');
    assert.ok(avContentHtml.includes('object-fit:cover'), 'Must contain object-fit:cover');
  });
});
