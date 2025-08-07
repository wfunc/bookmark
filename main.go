package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var (
	db        *gorm.DB
	jwtSecret = []byte("your-secret-key-change-this-in-production")
)

// Models
type User struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	Username  string     `gorm:"unique;not null" json:"username"`
	Password  string     `json:"-"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	Bookmarks []Bookmark `json:"bookmarks,omitempty"`
}

type Bookmark struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `json:"user_id"`
	Title     string    `json:"title"`
	URL       string    `json:"url"`
	Note      string    `json:"note"`
	Order     int       `json:"order"`
	IsPinned  bool      `json:"is_pinned" gorm:"default:false"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Claims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// Initialize database
func initDB() {
	var err error
	db, err = gorm.Open(sqlite.Open("bookmarks.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto migrate schemas
	err = db.AutoMigrate(&User{}, &Bookmark{})
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}
}

// Middleware
func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.GetHeader("Authorization")
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "No authorization token"})
			c.Abort()
			return
		}

		// Remove "Bearer " prefix
		tokenString = strings.TrimPrefix(tokenString, "Bearer ")

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Next()
	}
}

// CORS middleware
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// Registration verification code (simple server-side validation)
const REGISTRATION_CODE = "112211"

// Handlers
func register(c *gin.Context) {
	var input struct {
		Username         string `json:"username" binding:"required"`
		Password         string `json:"password" binding:"required"`
		VerificationCode string `json:"verification_code" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify registration code
	if input.VerificationCode != REGISTRATION_CODE {
		c.JSON(http.StatusBadRequest, gin.H{"error": "验证码错误"})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	user := User{
		Username: input.Username,
		Password: string(hashedPassword),
	}

	if err := db.Create(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username already exists"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "User created successfully"})
}

func login(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user User
	if err := db.Where("username = ?", input.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// Check password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// Generate JWT token
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID:   user.ID,
		Username: user.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": tokenString,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
		},
	})
}

func getBookmarks(c *gin.Context) {
	userID := c.GetUint("user_id")

	var bookmarks []Bookmark
	if err := db.Where("user_id = ?", userID).Order("is_pinned DESC, `order` DESC, id DESC").Find(&bookmarks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bookmarks"})
		return
	}

	c.JSON(http.StatusOK, bookmarks)
}

func createBookmark(c *gin.Context) {
	userID := c.GetUint("user_id")

	var input struct {
		Title string `json:"title" binding:"required"`
		URL   string `json:"url" binding:"required"`
		Note  string `json:"note"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get the max order value for this user and increment it
	// This ensures new bookmarks get the highest order value and appear first (since we sort DESC)
	var maxOrder int
	db.Model(&Bookmark{}).Where("user_id = ?", userID).Select("COALESCE(MAX(`order`), 0)").Scan(&maxOrder)

	bookmark := Bookmark{
		UserID: userID,
		Title:  input.Title,
		URL:    input.URL,
		Note:   input.Note,
		Order:  maxOrder + 1,
	}

	if err := db.Create(&bookmark).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create bookmark"})
		return
	}

	c.JSON(http.StatusCreated, bookmark)
}

func updateBookmark(c *gin.Context) {
	userID := c.GetUint("user_id")
	bookmarkID := c.Param("id")

	var bookmark Bookmark
	if err := db.Where("id = ? AND user_id = ?", bookmarkID, userID).First(&bookmark).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bookmark not found"})
		return
	}

	var input struct {
		Title string `json:"title"`
		URL   string `json:"url"`
		Note  string `json:"note"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if input.Title != "" {
		updates["title"] = input.Title
	}
	if input.URL != "" {
		updates["url"] = input.URL
	}
	updates["note"] = input.Note

	if err := db.Model(&bookmark).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update bookmark"})
		return
	}

	c.JSON(http.StatusOK, bookmark)
}

func deleteBookmark(c *gin.Context) {
	userID := c.GetUint("user_id")
	bookmarkID := c.Param("id")

	result := db.Where("id = ? AND user_id = ?", bookmarkID, userID).Delete(&Bookmark{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete bookmark"})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bookmark not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Bookmark deleted successfully"})
}

func reorderBookmarks(c *gin.Context) {
	userID := c.GetUint("user_id")

	var input struct {
		BookmarkIDs []uint `json:"bookmark_ids" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update order for each bookmark
	for i, id := range input.BookmarkIDs {
		db.Model(&Bookmark{}).Where("id = ? AND user_id = ?", id, userID).Update("order", i+1)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Bookmarks reordered successfully"})
}

func togglePin(c *gin.Context) {
	userID := c.GetUint("user_id")
	bookmarkID := c.Param("id")

	var bookmark Bookmark
	if err := db.Where("id = ? AND user_id = ?", bookmarkID, userID).First(&bookmark).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bookmark not found"})
		return
	}

	// Toggle pin status
	newPinStatus := !bookmark.IsPinned
	if err := db.Model(&bookmark).Update("is_pinned", newPinStatus).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update pin status"})
		return
	}

	bookmark.IsPinned = newPinStatus
	c.JSON(http.StatusOK, bookmark)
}

func main() {
	// Initialize database
	initDB()

	// Setup Gin router
	r := gin.Default()
	r.Use(corsMiddleware())

	// Serve static files
	r.Static("/static", "./static")
	r.StaticFile("/", "./static/index.html")

	// API routes
	api := r.Group("/api")
	{
		// Auth routes
		api.POST("/register", register)
		api.POST("/login", login)

		// Protected routes
		protected := api.Group("/")
		protected.Use(authMiddleware())
		{
			protected.GET("/bookmarks", getBookmarks)
			protected.POST("/bookmarks", createBookmark)
			protected.PUT("/bookmarks/:id", updateBookmark)
			protected.DELETE("/bookmarks/:id", deleteBookmark)
			protected.POST("/bookmarks/reorder", reorderBookmarks)
			protected.POST("/bookmarks/:id/pin", togglePin)
		}
	}

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
