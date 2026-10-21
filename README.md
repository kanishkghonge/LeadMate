# LeadMate - CRM with Cloud Sync

LeadMate is a personal CRM system for managing leads, follow-ups, and sales conversations. Now with WebDAV cloud synchronization!

## ✨ New Feature: WebDAV Cloud Sync

Back up your lead data automatically to any WebDAV-compatible cloud storage. Never lose your important customer information again!

### Key Features

- ✅ **Automatic Backups** - Schedule syncs every 5 minutes
- ✅ **Manual Control** - Upload/download backups on demand  
- ✅ **Secure** - HTTPS encryption, credentials stored locally
- ✅ **Free Options** - Works with free WebDAV providers
- ✅ **Cross-Device** - Access your data anywhere
- ✅ **Version History** - Multiple timestamped backups

## 🚀 Quick Start

1. Open LeadMate in your browser
2. Navigate to Settings (⚙ icon)
3. Scroll to "WebDAV Cloud Sync"
4. Enable sync and enter your credentials
5. Test connection and save

## 🌐 Recommended Free WebDAV Providers

### Koofr (Best Choice)
- **10 GB Free Storage**
- Setup: https://koofr.eu
- URL: `https://app.koofr.net/dav/Koofr/leadmate/`

### Nextcloud Providers
- **2-5 GB Free**
- Options: Nextcloud.com, TAB Digital, Cloud Store
- URL: `https://[provider]/remote.php/dav/files/[username]/leadmate/`

### Box.com
- **10 GB Free**
- Setup: https://box.com
- URL: `https://dav.box.com/dav/leadmate/`

### 4shared
- **15 GB Free**
- Setup: https://4shared.com
- URL: `https://webdav.4shared.com/leadmate/`

For detailed setup instructions, see [WEBDAV_SETUP.md](./WEBDAV_SETUP.md)

## 📋 Features

- Lead management with interaction history
- Task scheduling and follow-up reminders
- Call script workflows (cold calls, booked calls, follow-ups)
- Demo and client tracking
- AI prompt generation for daily tasks
- Local-first data storage
- Export/import data backups
- **NEW:** WebDAV cloud synchronization

## 🔧 Technical Details

- Pure JavaScript, no build step required
- Progressive Web App (PWA) ready
- localStorage for local data persistence
- WebDAV protocol for cloud sync
- Works offline (except cloud sync)

## 📦 Files

- `index.html` - Main application UI
- `app.js` - Core application logic
- `webdav-storage.js` - WebDAV sync module (NEW)
- `style.css` - Styling
- `WEBDAV_SETUP.md` - Detailed WebDAV setup guide

## 🔒 Security & Privacy

- All data stored locally in your browser
- Cloud sync is optional
- Your WebDAV credentials never leave your device
- HTTPS encryption for all cloud transfers
- No external tracking or analytics

## 💡 Usage Tips

1. **Test your connection** before enabling auto-sync
2. **Create manual backups** regularly for extra safety  
3. **Use app passwords** instead of your main password
4. **Keep local exports** as a backup to cloud sync
5. **Test restore process** to ensure backups work

## 🐛 Troubleshooting

### WebDAV Issues
- **401 Error**: Check username/password
- **404 Error**: Verify WebDAV URL is correct
- **403 Error**: Check storage quota and permissions
- See [WEBDAV_SETUP.md](./WEBDAV_SETUP.md) for more help

### General Issues
- Clear browser cache if app doesn't load
- Export data before making major changes
- Use "Test data mode" to try features safely

## 📱 Installation

### Desktop
1. Open `index.html` in a modern browser
2. Bookmark for easy access

### Mobile
1. Open in Safari (iOS) or Chrome (Android)
2. Add to Home Screen for app-like experience

## 🔄 Updates

**Version 2.0** (October 2024)
- Added WebDAV cloud synchronization
- Auto-sync with configurable intervals
- Multiple backup management
- Enhanced security with HTTPS validation

## 📄 License

This project is open source. Feel free to use and modify for personal or commercial use.

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- Additional cloud storage providers
- Conflict resolution for multi-device sync
- Enhanced encryption options
- Mobile app wrappers

## 🆘 Support

For WebDAV setup help, see [WEBDAV_SETUP.md](./WEBDAV_SETUP.md)

For general questions, check the Settings → How LeadMate works section in the app.

---

**Built with**: Vanilla JavaScript, HTML5, CSS3, WebDAV Protocol  
**Author**: LeadMate Team  
**Last Updated**: October 2024
