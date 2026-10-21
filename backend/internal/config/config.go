package config

import (
	"os"
	"strconv"
)

// Config is everything the service needs from the environment.
type Config struct {
	DatabaseURL string
	Port        string
	CORSOrigins string
}

func Load() Config {
	return Config{
		DatabaseURL: env("DATABASE_URL", "postgres://stockflow:stockflow@localhost:5432/stockflow?sslmode=disable"),
		Port:        env("PORT", "8080"),
		CORSOrigins: env("CORS_ORIGINS", "*"),
	}
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

// Addr is the listen address for the HTTP server.
func (c Config) Addr() string {
	return ":" + c.Port
}

// MustAtoi is a small helper used for optional numeric env vars.
func MustAtoi(s string, fallback int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return n
}
