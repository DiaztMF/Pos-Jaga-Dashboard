# VoxSilva — Web Dashboard Display Pos Jaga

Web Dashboard Display Real-Time untuk Pos Jaga sistem deteksi pembalakan liar **VoxSilva**. 

Dashboard ini membaca data secara instan dari **Firebase Realtime Database** yang diunggah secara otomatis oleh modul gateway **ESP32 Pos Jaga** (`pos_jaga.ino`) via Wi-Fi REST API.

---

## 🚀 Fitur Utama Dashboard
- **Real-Time Synchronisation (< 1 Detik)**: Sinkronisasi instan via WebSocket Firebase Realtime Database.
- **Visual Alert System**:
  - Peringatan Bahaya **Gergaji Mesin (Chainsaw - 0xAA)**: Banner merah menyala + sirine audio alarm otomatis.
  - Peringatan **Getaran Pohon (Vibration - 0xBB)**: Indicator MPU6050 motion alert.
- **Audio Siren Synthesizer**: Menggunakan Web Audio API internal browser (tanpa perlu mendownload file MP3 eksternal).
- **Monitoring Baterai & Node**: Menampilkan status tegangan baterai & Node ID terupdate.
- **Live Feed History Table**: Tabel riwayat kejadian yang ter-update otomatis.
- **Konfigurasi Lokal Cepat**: Form input URL Firebase Database yang tersimpan otomatis di `localStorage` browser.

---

## 🛠️ Langkah Konfigurasi Firebase (Hanya 3 Menit)

### 1. Buat Firebase Realtime Database
1. Buka [Firebase Console](https://console.firebase.google.com/) dan buat proyek baru (misal: `voxsilva-forest`).
2. Masuk ke menu **Build > Realtime Database**, klik **Create Database**.
3. Pilih lokasi database (misal: `United States` atau `Singapore`) dan pilih mode **Test Mode** (agar bisa dibaca/ditulis).
4. Catat **URL Database Anda**, contohnya:
   ```text
   https://voxsilva-forest-default-rtdb.firebaseio.com
   ```

### 2. Atur Database Rules (Aturan Akses)
Di tab **Rules** pada Firebase Realtime Database, atur aturan agar ESP32 Pos Jaga dan Web Dashboard bisa membaca/menulis data:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
*(Klik **Publish**)*.

---

## 📡 Konfigurasi Hardware ESP32 Pos Jaga (`pos_jaga.ino`)
Di file `pos_jaga/pos_jaga.ino`, sesuaikan variabel berikut dengan Wi-Fi dan URL Firebase Anda:
```cpp
const char* WIFI_SSID     = "NAMA_WIFI_POS_JAGA";      
const char* WIFI_PASSWORD = "PASSWORD_WIFI_POS_JAGA";  
const char* FIREBASE_URL  = "https://voxsilva-forest-default-rtdb.firebaseio.com/alerts.json";
```

---

## 💻 Cara Menjalankan Web Dashboard Display

### Cara 1: Langsung Buka di Browser (Tanpa Server)
1. Buka file `dashboard/index.html` langsung di browser laptop/PC Pos Jaga (Chrome / Edge / Firefox).
2. Di kotak **Pengaturan Firebase Database** (sebelah kanan bawah):
   - Masukkan **Database URL**: `https://voxsilva-forest-default-rtdb.firebaseio.com`
   - Klik **Simpan & Hubungkan Firebase**.
3. Dashboard akan langsung terhubung dan siap menampilkan alert real-time!

### Cara 2: Deploy Gratis ke Firebase Hosting
Jika ingin diakses via internet dari mana saja:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

---

## 📊 Format Payload JSON Firebase
Setiap kali `node_hutan` mendeteksi ancaman, ESP32 `pos_jaga` menembak data JSON berikut ke Firebase:
```json
{
  "node_id": "0x01",
  "alert_type": "CHAINSAW",
  "alert_code": "0xAA",
  "confidence": 99,
  "battery": 3.80,
  "timestamp": {".sv": "timestamp"}
}
```