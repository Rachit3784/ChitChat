import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import database from '@react-native-firebase/database';

// Initial Setup
GoogleSignin.configure({
  webClientId: '835370158815-92o7gjqdclubd63aom9cvgau5j6oeqn0.apps.googleusercontent.com',
});


export { auth, firestore, database, GoogleSignin };